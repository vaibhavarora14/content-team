import { getRun, setRunSourceDocuments, setRunStatus } from '../_lib/dev-store.js'
import { json, parseJsonBody } from '../_lib/http.js'
import { scrapeUrls } from '../_lib/oxylabs.js'
import { getSupabaseAdmin } from '../_lib/supabase.js'

export const config = {
  runtime: 'edge',
}

type ScrapeRequest = {
  runId?: string
  maxUrls?: number
  resultIds?: string[]
}

type SourceResultRow = {
  id: string
  url: string
  title: string
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405)
    }

    const body = await parseJsonBody<ScrapeRequest>(request)
    const runId = body?.runId?.trim()
    if (!runId) {
      return json({ error: 'runId is required.' }, 400)
    }

    const maxUrls = Math.max(1, Math.min(10, body.maxUrls ?? 5))
    const supabase = getSupabaseAdmin()
    const fallbackRun = getRun(runId)
    const usingFallbackStore = Boolean(fallbackRun)

    let rows: SourceResultRow[] = []
    if (usingFallbackStore) {
      rows = (fallbackRun?.sourceResults ?? [])
        .slice(0, maxUrls)
        .map((result) => ({ id: result.id, url: result.url, title: result.title }))
    } else {
      let query = supabase
        .from('source_results')
        .select('id, url, title')
        .eq('run_id', runId)
        .order('rank', { ascending: true })
        .limit(maxUrls)

      if (body.resultIds?.length) {
        query = query.in('id', body.resultIds)
      }

      const { data: sourceResults, error: sourceResultsError } = await query
      if (sourceResultsError) {
        return json({ error: sourceResultsError.message }, 500)
      }

      rows = (sourceResults ?? []) as SourceResultRow[]
    }

    if (!rows.length) {
      return json({ error: 'No source results found for this run.' }, 404)
    }

    const scrapeResponse = await scrapeUrls(rows.map((row) => row.url))
    const resultByUrl = new Map(rows.map((row) => [row.url, row]))

    const documentsPayload = scrapeResponse.documents.map((document) => {
      const sourceResult = resultByUrl.get(document.url)
      const extractedText = document.extractedText.slice(0, 12000)
      return {
        run_id: runId,
        source_result_id: sourceResult?.id ?? null,
        url: document.url,
        title: document.title,
        extracted_text: extractedText,
        char_count: extractedText.length,
        provider_request_id: document.providerRequestId ?? scrapeResponse.providerRequestId,
      }
    })

    let responseDocuments: Array<{ id: string; url: string; title: string; preview: string }> = []

    if (usingFallbackStore) {
      const savedDocuments = setRunSourceDocuments(
        runId,
        scrapeResponse.documents.map((document) => ({
          ...document,
          extractedText: document.extractedText.slice(0, 12000),
        }))
      )
      setRunStatus(runId, 'scrape_done')
      responseDocuments = savedDocuments.map((document) => ({
        id: document.id,
        url: document.url,
        title: document.title,
        preview: document.extractedText.slice(0, 500),
      }))
    } else {
      const { data: insertedDocuments, error: insertError } = await supabase
        .from('source_documents')
        .insert(documentsPayload)
        .select('id, url, title, extracted_text')

      if (insertError) {
        return json({ error: insertError.message }, 500)
      }

      await supabase
        .from('search_runs')
        .update({
          status: 'scrape_done',
          scraped_count: documentsPayload.length,
          provider_request_id: scrapeResponse.providerRequestId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)

      responseDocuments = (insertedDocuments ?? []).map((document) => ({
        id: document.id,
        url: document.url,
        title: document.title,
        preview: (document.extracted_text as string).slice(0, 500),
      }))
    }

    return json({
      documents: responseDocuments,
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
