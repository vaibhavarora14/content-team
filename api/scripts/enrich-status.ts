import { getRun, setRunEnrichment } from '../_lib/dev-store.js'
import { json } from '../_lib/http.js'
import { getRenderVideoJobStatus, type VideoJobStatus } from '../_lib/render-worker.js'
import { getSupabaseAdmin } from '../_lib/supabase.js'

export const config = {
  runtime: 'nodejs',
}

type FirstScriptVideo = {
  status: VideoJobStatus
  jobId?: string
  publicUrl?: string
  error?: string
}

type EnrichmentPayload = {
  twitterPosts: Array<{ scriptId: string; text: string }>
  firstScriptVideo: FirstScriptVideo
}

const withTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(fallbackValue), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

const withTimeoutOrNull = async <T>(task: Promise<T>, timeoutMs: number): Promise<T | null> => {
  return await withTimeout(task, timeoutMs, null as T | null)
}

const getRunIdFromRequest = (request: Request) => {
  const url = new URL(request.url)
  return (url.searchParams.get('runId') ?? '').trim()
}

const maybePersistEnrichment = async (runId: string, payload: EnrichmentPayload) => {
  try {
    const supabase = getSupabaseAdmin()
    await withTimeoutOrNull(
      supabase.from('run_enrichments').upsert(
        {
          run_id: runId,
          twitter_posts_json: payload.twitterPosts,
          video_job_id: payload.firstScriptVideo.jobId ?? null,
          video_status: payload.firstScriptVideo.status,
          video_url: payload.firstScriptVideo.publicUrl ?? null,
          video_error: payload.firstScriptVideo.error ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'run_id' }
      ),
      4000
    )
  } catch {
    // Enrichment storage can be unavailable in local/dev.
  }
}

const refreshVideoStatus = async (payload: EnrichmentPayload): Promise<EnrichmentPayload> => {
  const current = payload.firstScriptVideo
  if (!current.jobId || current.status === 'completed' || current.status === 'failed') {
    return payload
  }

  const statusResult = await getRenderVideoJobStatus(current.jobId)
  if (!statusResult.ok) {
    return {
      ...payload,
      firstScriptVideo: {
        ...current,
        status: 'failed',
        error: statusResult.error,
      },
    }
  }

  return {
    ...payload,
    firstScriptVideo: {
      status: statusResult.status,
      jobId: current.jobId,
      publicUrl: statusResult.publicUrl ?? current.publicUrl,
      error: statusResult.error,
    },
  }
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
    if (fallbackRun?.enrichment) {
      const refreshed = await refreshVideoStatus({
        twitterPosts: fallbackRun.enrichment.twitterPosts ?? [],
        firstScriptVideo: fallbackRun.enrichment.firstScriptVideo ?? { status: 'failed', error: 'Missing video state.' },
      })

      setRunEnrichment(runId, refreshed)
      return json(refreshed)
    }

    let persistedPayload: EnrichmentPayload | null = null
    try {
      const supabase = getSupabaseAdmin()
      const response = await withTimeoutOrNull(
        supabase.from('run_enrichments').select('*').eq('run_id', runId).maybeSingle(),
        4000
      )
      const data = response?.data
      if (data) {
        persistedPayload = {
          twitterPosts: (data.twitter_posts_json as Array<{ scriptId: string; text: string }>) ?? [],
          firstScriptVideo: {
            status: data.video_status ?? 'queued',
            jobId: data.video_job_id ?? undefined,
            publicUrl: data.video_url ?? undefined,
            error: data.video_error ?? undefined,
          },
        }
      }
    } catch {
      persistedPayload = null
    }

    if (!persistedPayload) {
      return json({ error: 'Enrichment not found for run.' }, 404)
    }

    const refreshed = await refreshVideoStatus(persistedPayload)
    await maybePersistEnrichment(runId, refreshed)
    return json(refreshed)
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      500
    )
  }
}
