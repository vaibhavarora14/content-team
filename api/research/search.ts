import { deriveQueriesFromBrief } from '../_lib/brief-interpreter'
import { createRun, setRunSourceResults, setRunStatus } from '../_lib/dev-store'
import { json, parseJsonBody } from '../_lib/http'
import { searchKeyword } from '../_lib/oxylabs'
import { getSupabaseAdmin } from '../_lib/supabase'
import type { SourceResult } from '../_lib/types'

export const config = {
  runtime: 'edge',
}

type SearchRequest = {
  brandBrief?: string
  gl?: string
  hl?: string
  topN?: number
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405)
    }

    const body = await parseJsonBody<SearchRequest>(request)
    const brandBrief = body?.brandBrief?.trim()
    if (!brandBrief) {
      return json({ error: 'brandBrief is required.' }, 400)
    }

    const gl = body.gl?.trim() || 'us'
    const hl = body.hl?.trim() || 'en'
    const topN = Math.max(5, Math.min(15, body.topN ?? 10))
    const derivedQueries = deriveQueriesFromBrief(brandBrief)
    const supabase = getSupabaseAdmin()
    let runId = ''
    let runCreatedAt = new Date().toISOString()
    let usingFallbackStore = false

    const { data: run, error: runError } = await supabase
      .from('search_runs')
      .insert([
        {
          brand_brief: brandBrief,
          derived_queries: derivedQueries,
          gl,
          hl,
          status: 'search_started',
        },
      ])
      .select('id, status, created_at')
      .single()

    if (runError || !run) {
      usingFallbackStore = true
      const fallbackRun = createRun({ brandBrief, gl, hl, derivedQueries })
      runId = fallbackRun.id
      runCreatedAt = fallbackRun.createdAt
    } else {
      runId = run.id
      runCreatedAt = run.created_at
    }

    const startedAt = Date.now()
    const allResults: SourceResult[] = []
    let providerRequestId: string | undefined

    for (const derivedQuery of derivedQueries) {
      const response = await searchKeyword({
        query: derivedQuery.query,
        gl,
        hl,
        topN,
      })
      allResults.push(...response.results)
      providerRequestId = providerRequestId ?? response.providerRequestId
    }

    const dedupedResults = Array.from(
      new Map(allResults.map((result) => [`${result.query}:${result.url}`, result])).values()
    )

    if (dedupedResults.length && !usingFallbackStore) {
      const { error: insertError } = await supabase.from('source_results').insert(
        dedupedResults.map((result) => ({
          run_id: runId,
          query: result.query,
          rank: result.rank,
          title: result.title,
          url: result.url,
          snippet: result.snippet,
          source: result.source,
        }))
      )

      if (insertError) {
        return json({ error: insertError.message }, 500)
      }
    }

    if (usingFallbackStore) {
      setRunSourceResults(runId, dedupedResults)
      setRunStatus(runId, 'serp_done')
    } else {
      await supabase
        .from('search_runs')
        .update({
          status: 'serp_done',
          fetched_count: dedupedResults.length,
          query_latency_ms: Date.now() - startedAt,
          provider_request_id: providerRequestId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)
    }

    return json({
      run: {
        id: runId,
        status: 'serp_done',
        createdAt: runCreatedAt,
      },
      derivedQueries,
      results: dedupedResults,
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
