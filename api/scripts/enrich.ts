import { getRun, setRunEnrichment } from '../_lib/dev-store.js'
import { json, parseJsonBody } from '../_lib/http.js'
import { createRenderVideoJob } from '../_lib/render-worker.js'
import { getSupabaseAdmin } from '../_lib/supabase.js'
import { type EnrichmentStage, type TwitterStatus, type TwitterStatePayload } from '../_lib/enrichment.js'
import type { VideoScript } from '../_lib/types.js'

export const config = {
  runtime: 'nodejs',
}

type EnrichScriptsRequest = {
  runId?: string
  scripts?: Array<VideoScript & { id: string }>
  startVideo?: boolean
}

type FirstScriptVideo = {
  status: 'not_started' | 'queued' | 'processing' | 'completed' | 'failed'
  jobId?: string
  publicUrl?: string
  error?: string
}

type EnrichResponse = {
  runId: string
  stage: EnrichmentStage
  twitterStatus: TwitterStatus
  twitterPosts: Array<{ scriptId: string; text: string }>
  firstScriptVideo: FirstScriptVideo
  warnings?: string[]
}

const SUPABASE_TIMEOUT_MS = 3000

type SupabaseResponse = {
  data?: any
  error?: {
    message?: string
  } | null
}

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

const persistEnrichment = async (
  runId: string,
  payload: EnrichResponse
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  try {
    const supabase = getSupabaseAdmin()
    const response = (await withTimeoutOrNull(
      supabase.from('run_enrichments').upsert(
        {
          run_id: runId,
          twitter_posts_json: {
            status: payload.twitterStatus,
            posts: payload.twitterPosts,
          } as TwitterStatePayload,
          video_job_id: payload.firstScriptVideo.jobId ?? null,
          video_status: payload.firstScriptVideo.status,
          video_url: payload.firstScriptVideo.publicUrl ?? null,
          video_error: payload.firstScriptVideo.error ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'run_id' }
      ),
      SUPABASE_TIMEOUT_MS
    )) as SupabaseResponse | null

    if (!response) {
      return { ok: false, reason: 'Timed out persisting enrichment.' }
    }

    if (response.error) {
      return { ok: false, reason: response.error.message ?? 'Supabase upsert failed.' }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Supabase unavailable while persisting enrichment.',
    }
  }
}

const getBrandBrief = async (runId: string): Promise<string> => {
  const fallbackRun = getRun(runId)
  if (fallbackRun?.brandBrief?.trim()) {
    return fallbackRun.brandBrief.trim()
  }
  try {
    const supabase = getSupabaseAdmin()
    const response = (await withTimeoutOrNull(
      supabase.from('search_runs').select('brand_brief').eq('id', runId).single(),
      SUPABASE_TIMEOUT_MS
    )) as SupabaseResponse | null
    if (!response || response.error) {
      return ''
    }
    return typeof response.data?.brand_brief === 'string' ? response.data.brand_brief : ''
  } catch (error) {
    return ''
  }
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405)
    }

    const body = await parseJsonBody<EnrichScriptsRequest>(request)
    const runId = body?.runId?.trim()
    const scripts = body?.scripts ?? []
    const startVideo = body?.startVideo === true
    if (!runId) {
      return json({ error: 'runId is required.' }, 400)
    }
    if (!scripts.length) {
      return json({ error: 'scripts is required.' }, 400)
    }

    const warnings: string[] = []
    const brandBrief = await getBrandBrief(runId)
    let jobId: string | undefined
    if (startVideo) {
      const renderResult = await createRenderVideoJob(runId, {
        firstScript: scripts[0],
        scripts,
        brandBrief,
        startVideo: true,
      })

      if ('error' in renderResult) {
        return json(
          {
            runId,
            stage: 'failed' as EnrichmentStage,
            twitterStatus: 'failed' as TwitterStatus,
            twitterPosts: [] as Array<{ scriptId: string; text: string }>,
            firstScriptVideo: {
              status: 'failed' as const,
              error: renderResult.error,
            },
            warnings: [`Job enqueue failed: ${renderResult.error}`],
          },
          503
        )
      }
      jobId = renderResult.jobId
    } else {
      const renderResult = await createRenderVideoJob(runId, {
        firstScript: scripts[0],
        scripts,
        brandBrief,
        startVideo: false,
      })
      if ('error' in renderResult) {
        warnings.push(`Twitter job enqueue failed: ${renderResult.error}`)
      } else {
        jobId = renderResult.jobId
      }
    }

    const payload: EnrichResponse = {
      runId,
      stage: jobId ? (startVideo ? 'queued' : 'twitter') : 'failed',
      twitterStatus: jobId ? 'pending' : 'failed',
      twitterPosts: [],
      firstScriptVideo: {
        status: startVideo ? 'queued' : 'not_started',
        jobId,
      },
    }

    const fallbackRun = getRun(runId)
    if (fallbackRun) {
      setRunEnrichment(runId, {
        stage: payload.stage,
        twitterStatus: payload.twitterStatus,
        twitterPosts: [],
        firstScriptVideo: payload.firstScriptVideo,
      })
    }

    const persistResult = await persistEnrichment(runId, payload)
    if (!persistResult.ok) {
      warnings.push(persistResult.reason)
    }

    return json(warnings.length ? { ...payload, warnings } : payload, 202)
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      500
    )
  }
}
