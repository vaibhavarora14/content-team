import { getRun, setRunEnrichment } from '../_lib/dev-store.js'
import { json } from '../_lib/http.js'
import { getRenderVideoJobStatus, type VideoJobStatus } from '../_lib/render-worker.js'
import { normalizeTwitterState, type EnrichmentStage, type TwitterStatus } from '../_lib/enrichment.js'
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
  runId?: string
  stage?: EnrichmentStage
  twitterStatus?: TwitterStatus
  twitterPosts: Array<{ scriptId: string; text: string }>
  firstScriptVideo: FirstScriptVideo
  warning?: string
}

const SUPABASE_TIMEOUT_MS = 4000

type SupabaseResponse = {
  data?: any
  error?: {
    message?: string
  } | null
}

type PersistedLookup =
  | { kind: 'found'; payload: EnrichmentPayload }
  | { kind: 'missing' }
  | { kind: 'unavailable'; reason: string }

const withTimeout = async <T>(
  task: PromiseLike<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(task),
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

const withTimeoutOrNull = async <T>(task: PromiseLike<T>, timeoutMs: number): Promise<T | null> => {
  return await withTimeout(task, timeoutMs, null as T | null)
}

const getRunIdFromRequest = (request: Request) => {
  const url = new URL(request.url)
  return (url.searchParams.get('runId') ?? '').trim()
}

const maybePersistEnrichment = async (runId: string, payload: EnrichmentPayload): Promise<void> => {
  try {
    const supabase = getSupabaseAdmin()
    await withTimeoutOrNull(
      supabase.from('run_enrichments').upsert(
        {
          run_id: runId,
          twitter_posts_json: {
            status: payload.twitterStatus ?? (payload.twitterPosts.length ? 'completed' : 'pending'),
            posts: payload.twitterPosts,
          },
          video_job_id: payload.firstScriptVideo.jobId ?? null,
          video_status: payload.firstScriptVideo.status,
          video_url: payload.firstScriptVideo.publicUrl ?? null,
          video_error: payload.firstScriptVideo.error ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'run_id' }
      ),
      SUPABASE_TIMEOUT_MS
    )
  } catch {}
}

const refreshVideoStatus = async (payload: EnrichmentPayload): Promise<EnrichmentPayload> => {
  const current = payload.firstScriptVideo
  const twitterTerminal = payload.twitterStatus === 'completed' || payload.twitterStatus === 'failed'
  if (
    !current.jobId ||
    current.status === 'completed' ||
    current.status === 'failed' ||
    (current.status === 'not_started' && twitterTerminal)
  ) {
    return payload
  }

  const statusResult = await getRenderVideoJobStatus(current.jobId)
  if (!statusResult.ok) {
    return {
      ...payload,
      firstScriptVideo: {
        ...current,
        status: current.status === 'queued' || current.status === 'processing' ? current.status : 'processing',
        error: `Worker status unavailable: ${statusResult.error}`,
      },
      warning: `Worker status unavailable: ${statusResult.error}`,
    }
  }

  return {
    ...payload,
    stage: statusResult.stage ?? payload.stage,
    twitterStatus: statusResult.twitterStatus ?? payload.twitterStatus,
    twitterPosts: statusResult.twitterPosts?.length ? statusResult.twitterPosts : payload.twitterPosts,
    firstScriptVideo: {
      status: statusResult.status,
      jobId: current.jobId,
      publicUrl: statusResult.publicUrl ?? current.publicUrl,
      error: statusResult.error,
    },
  }
}

const getPersistedEnrichment = async (runId: string): Promise<PersistedLookup> => {
  try {
    const supabase = getSupabaseAdmin()
    const response = (await withTimeoutOrNull(
      supabase.from('run_enrichments').select('*').eq('run_id', runId).maybeSingle(),
      SUPABASE_TIMEOUT_MS
    )) as SupabaseResponse | null

    if (!response) {
      return { kind: 'unavailable', reason: 'Timed out fetching enrichment state.' }
    }

    if (response.error) {
      return { kind: 'unavailable', reason: response.error.message ?? 'Failed fetching enrichment state.' }
    }

    if (!response.data) {
      return { kind: 'missing' }
    }

    return {
      kind: 'found',
      payload: {
        runId,
        stage:
          response.data.video_status === 'completed'
            ? 'completed'
            : response.data.video_status === 'failed'
              ? 'failed'
              : response.data.video_status === 'not_started'
                ? 'twitter'
                : 'video',
        twitterStatus: normalizeTwitterState(response.data.twitter_posts_json).status,
        twitterPosts: normalizeTwitterState(response.data.twitter_posts_json).posts,
        firstScriptVideo: {
          status: response.data.video_status ?? (response.data.video_job_id ? 'queued' : 'not_started'),
          jobId: response.data.video_job_id ?? undefined,
          publicUrl: response.data.video_url ?? undefined,
          error: response.data.video_error ?? undefined,
        },
      },
    }
  } catch (error) {
    return {
      kind: 'unavailable',
      reason: error instanceof Error ? error.message : 'Failed fetching enrichment state.',
    }
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
        runId,
        stage:
          fallbackRun.enrichment.firstScriptVideo?.status === 'completed'
            ? 'completed'
            : fallbackRun.enrichment.firstScriptVideo?.status === 'not_started'
              ? 'twitter'
              : 'video',
        twitterStatus: fallbackRun.enrichment.twitterPosts?.length ? 'completed' : 'pending',
        twitterPosts: fallbackRun.enrichment.twitterPosts ?? [],
        firstScriptVideo: fallbackRun.enrichment.firstScriptVideo ?? { status: 'failed', error: 'Missing video state.' },
      })

      setRunEnrichment(runId, refreshed)
      return json(refreshed)
    }

    const persistedLookup = await getPersistedEnrichment(runId)
    if (persistedLookup.kind === 'unavailable') {
      return json({ error: persistedLookup.reason }, 503)
    }

    if (persistedLookup.kind === 'missing') {
      return json({ error: 'Enrichment not found for run.' }, 404)
    }

    const refreshed = await refreshVideoStatus(persistedLookup.payload)
    const shouldPersist =
      refreshed.firstScriptVideo.status === 'completed' ||
      refreshed.firstScriptVideo.status === 'failed' ||
      refreshed.twitterStatus === 'completed' ||
      refreshed.twitterStatus === 'failed'
    if (shouldPersist) {
      await maybePersistEnrichment(runId, refreshed)
    }
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
