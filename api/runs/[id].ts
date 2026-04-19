import { json } from '../_lib/http.js'
import { getRun } from '../_lib/dev-store.js'
import { getSupabaseAdmin } from '../_lib/supabase.js'

export const config = {
  runtime: 'edge',
}

const getRunIdFromRequest = (request: Request) => {
  const url = new URL(request.url)
  const segments = url.pathname.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed.' }, 405)
    }

    const runId = getRunIdFromRequest(request)
    if (!runId) {
      return json({ error: 'runId is required.' }, 400)
    }

    const fallbackRun = getRun(runId)
    if (fallbackRun) {
      return json({
        run: {
          id: fallbackRun.id,
          brand_brief: fallbackRun.brandBrief,
          gl: fallbackRun.gl,
          hl: fallbackRun.hl,
          status: fallbackRun.status,
          created_at: fallbackRun.createdAt,
        },
        sourceResults: fallbackRun.sourceResults,
        sourceDocuments: fallbackRun.sourceDocuments.map((document) => ({
          id: document.id,
          url: document.url,
          title: document.title,
          extracted_text: document.extractedText,
        })),
        topicCandidates: fallbackRun.topicCandidates.map((topic) => ({
          id: topic.id,
          title: topic.title,
          angle: topic.angle,
          why_now: topic.whyNow,
          confidence: topic.confidence,
          source_result_ids: topic.sourceResultIds,
        })),
        videoScripts: fallbackRun.videoScripts.map((script) => ({
          id: script.id,
          title: script.title,
          hook: script.hook,
          body_points: script.bodyPoints,
          cta: script.cta,
          duration_sec: script.durationSec,
        })),
      })
    }

    const supabase = getSupabaseAdmin()
    const { data: run, error: runError } = await supabase
      .from('search_runs')
      .select('*')
      .eq('id', runId)
      .single()

    if (runError || !run) {
      return json({ error: runError?.message ?? 'Run not found.' }, 404)
    }

    const [sourceResultsResponse, sourceDocumentsResponse, topicCandidatesResponse, videoScriptsResponse] =
      await Promise.all([
        supabase
          .from('source_results')
          .select('*')
          .eq('run_id', runId)
          .order('rank', { ascending: true }),
        supabase.from('source_documents').select('*').eq('run_id', runId),
        supabase
          .from('topic_candidates')
          .select('*')
          .eq('run_id', runId)
          .order('confidence', { ascending: false }),
        supabase.from('video_scripts').select('*').eq('run_id', runId),
      ])

    const queryErrors = [
      sourceResultsResponse.error,
      sourceDocumentsResponse.error,
      topicCandidatesResponse.error,
      videoScriptsResponse.error,
    ].filter(Boolean)

    if (queryErrors.length) {
      return json({ error: queryErrors[0]?.message ?? 'Could not load run details.' }, 500)
    }

    return json({
      run,
      sourceResults: sourceResultsResponse.data ?? [],
      sourceDocuments: sourceDocumentsResponse.data ?? [],
      topicCandidates: topicCandidatesResponse.data ?? [],
      videoScripts: videoScriptsResponse.data ?? [],
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
