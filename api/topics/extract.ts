import { getRun, setRunStatus, setRunTopics } from '../_lib/dev-store'
import { json, parseJsonBody } from '../_lib/http'
import { getSupabaseAdmin } from '../_lib/supabase'
import { extractTopicsFromResearch } from '../_lib/topic-extractor'
import type { SourceDocument, SourceResult } from '../_lib/types'

export const config = {
  runtime: 'edge',
}

type ExtractTopicsRequest = {
  runId?: string
}

type SearchRunRow = {
  brand_brief: string
}

type SourceResultRow = {
  id: string
  query: string
  rank: number
  title: string
  url: string
  snippet: string
  source: string
}

type SourceDocumentRow = {
  source_result_id: string | null
  url: string
  title: string
  extracted_text: string
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405)
    }

    const body = await parseJsonBody<ExtractTopicsRequest>(request)
    const runId = body?.runId?.trim()
    if (!runId) {
      return json({ error: 'runId is required.' }, 400)
    }

    const supabase = getSupabaseAdmin()
    const fallbackRun = getRun(runId)
    const usingFallbackStore = Boolean(fallbackRun)
    let run: SearchRunRow | null = null
    let sourceResults: SourceResultRow[] = []
    let sourceDocuments: SourceDocumentRow[] = []

    if (usingFallbackStore) {
      run = { brand_brief: fallbackRun?.brandBrief ?? '' }
      sourceResults = (fallbackRun?.sourceResults ?? []).map((item) => ({
        id: item.id,
        query: item.query,
        rank: item.rank,
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        source: item.source,
      }))
      sourceDocuments = (fallbackRun?.sourceDocuments ?? []).map((item) => ({
        source_result_id: item.sourceResultId ?? null,
        url: item.url,
        title: item.title,
        extracted_text: item.extractedText,
      }))
    } else {
      const runResponse = await supabase
        .from('search_runs')
        .select('brand_brief')
        .eq('id', runId)
        .single()

      if (runResponse.error || !runResponse.data) {
        return json({ error: runResponse.error?.message ?? 'Run not found.' }, 404)
      }
      run = runResponse.data as SearchRunRow

      const sourceResultsResponse = await supabase
        .from('source_results')
        .select('id, query, rank, title, url, snippet, source')
        .eq('run_id', runId)
        .order('rank', { ascending: true })
      if (sourceResultsResponse.error) {
        return json({ error: sourceResultsResponse.error.message }, 500)
      }
      sourceResults = (sourceResultsResponse.data ?? []) as SourceResultRow[]

      const sourceDocumentsResponse = await supabase
        .from('source_documents')
        .select('source_result_id, url, title, extracted_text')
        .eq('run_id', runId)
      if (sourceDocumentsResponse.error) {
        return json({ error: sourceDocumentsResponse.error.message }, 500)
      }
      sourceDocuments = (sourceDocumentsResponse.data ?? []) as SourceDocumentRow[]
    }

    const topicResult = await extractTopicsFromResearch({
      brandBrief: (run as SearchRunRow).brand_brief,
      sourceResults: sourceResults.map((result) => ({
        query: result.query,
        rank: result.rank,
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        source: result.source,
      })) as SourceResult[],
      sourceDocuments: sourceDocuments.map((document) => ({
        sourceResultId: document.source_result_id ?? undefined,
        url: document.url,
        title: document.title,
        extractedText: document.extracted_text,
      })) as SourceDocument[],
    })

    const fallbackSourceIds = sourceResults.slice(0, 2).map((row) => row.id)
    const inserts = topicResult.topics.map((topic) => ({
      run_id: runId,
      title: topic.title,
      angle: topic.angle,
      why_now: topic.whyNow,
      confidence: topic.confidence,
      source_result_ids: topic.sourceResultIds.length ? topic.sourceResultIds : fallbackSourceIds,
    }))

    let responseTopics: Array<{
      id: string
      title: string
      angle: string
      whyNow: string
      confidence: number
      sourceResultIds: string[]
    }> = []

    if (usingFallbackStore) {
      const savedTopics = setRunTopics(runId, topicResult.topics)
      setRunStatus(runId, 'topics_done')
      responseTopics = savedTopics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        angle: topic.angle,
        whyNow: topic.whyNow,
        confidence: topic.confidence,
        sourceResultIds: topic.sourceResultIds,
      }))
    } else {
      const { data: insertedTopics, error: insertError } = await supabase
        .from('topic_candidates')
        .insert(inserts)
        .select('id, title, angle, why_now, confidence, source_result_ids')

      if (insertError) {
        return json({ error: insertError.message }, 500)
      }

      await supabase
        .from('search_runs')
        .update({
          status: 'topics_done',
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)

      responseTopics = (insertedTopics ?? []).map((topic) => ({
        id: topic.id,
        title: topic.title,
        angle: topic.angle,
        whyNow: topic.why_now,
        confidence: topic.confidence,
        sourceResultIds: (topic.source_result_ids as string[]) ?? [],
      }))
    }

    return json({
      topics: responseTopics,
      usage: topicResult.usage,
    })
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      500
    )
  }
}
