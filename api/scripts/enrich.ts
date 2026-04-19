import { getRun, setRunEnrichment } from '../_lib/dev-store.js'
import { json, parseJsonBody } from '../_lib/http.js'
import { generateTwitterPosts } from '../_lib/llm.js'
import { createRenderVideoJob } from '../_lib/render-worker.js'
import { getSupabaseAdmin } from '../_lib/supabase.js'
import type { VideoScript } from '../_lib/types.js'

export const config = {
  runtime: 'nodejs',
}

type EnrichScriptsRequest = {
  runId?: string
  scripts?: Array<VideoScript & { id: string }>
}

type FirstScriptVideo = {
  status: 'queued' | 'processing' | 'completed' | 'failed'
  jobId?: string
  publicUrl?: string
  error?: string
}

const SUPABASE_TIMEOUT_MS = 4000
const TWITTER_TIMEOUT_MS = 18000

type SupabaseResponse = {
  data?: any
  error?: {
    message?: string
  } | null
}

type ExistingEnrichmentLookup =
  | {
      kind: 'found'
      enrichment: {
        twitterPosts: Array<{ scriptId: string; text: string }>
        firstScriptVideo: FirstScriptVideo
      }
    }
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

const fallbackTwitterPosts = (scripts: Array<VideoScript & { id: string }>) =>
  scripts.map((script, index) => ({
    scriptId: script.id,
    text: `${script.hook} ${script.cta}`.trim().slice(0, 280),
    scriptIndex: index + 1,
  }))

const maybePersistEnrichment = async (
  runId: string,
  payload: {
    twitterPosts: Array<{ scriptId: string; text: string }>
    firstScriptVideo: FirstScriptVideo
  }
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  try {
    const supabase = getSupabaseAdmin()
    const response = (await withTimeoutOrNull(
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

const getExistingEnrichment = async (runId: string): Promise<ExistingEnrichmentLookup> => {
  const fallbackRun = getRun(runId)
  if (fallbackRun?.enrichment) {
    return { kind: 'found', enrichment: fallbackRun.enrichment }
  }

  try {
    const supabase = getSupabaseAdmin()
    const response = (await withTimeoutOrNull(
      supabase.from('run_enrichments').select('*').eq('run_id', runId).maybeSingle(),
      SUPABASE_TIMEOUT_MS
    )) as { data?: any } | null

    if (!response) {
      return { kind: 'unavailable', reason: 'Timed out checking existing enrichment.' }
    }

    if (response.error) {
      return { kind: 'unavailable', reason: response.error.message ?? 'Failed reading existing enrichment.' }
    }

    const data = response?.data
    if (!data) {
      return { kind: 'missing' }
    }

    return {
      kind: 'found',
      enrichment: {
        twitterPosts: (data.twitter_posts_json as Array<{ scriptId: string; text: string }>) ?? [],
        firstScriptVideo: {
          status: data.video_status ?? 'queued',
          jobId: data.video_job_id ?? undefined,
          publicUrl: data.video_url ?? undefined,
          error: data.video_error ?? undefined,
        } as FirstScriptVideo,
      },
    }
  } catch (error) {
    return {
      kind: 'unavailable',
      reason: error instanceof Error ? error.message : 'Failed reading existing enrichment.',
    }
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
    if (!runId) {
      return json({ error: 'runId is required.' }, 400)
    }
    if (!scripts.length) {
      return json({ error: 'scripts is required.' }, 400)
    }

    const warnings: string[] = []
    const fallbackRun = getRun(runId)
    let brandBrief = fallbackRun?.brandBrief ?? ''
    if (!brandBrief) {
      try {
        const supabase = getSupabaseAdmin()
        const response = (await withTimeoutOrNull(
          supabase.from('search_runs').select('brand_brief').eq('id', runId).single(),
          SUPABASE_TIMEOUT_MS
        )) as { data?: { brand_brief?: string } } | null
        if (!response) {
          warnings.push('Timed out loading brand brief; using fallback tweets.')
        }
        brandBrief = response?.data?.brand_brief?.trim() ?? ''
      } catch {
        brandBrief = ''
      }
    }

    const twitter = await withTimeout(
      generateTwitterPosts({
        brandBrief,
        scripts,
      }),
      TWITTER_TIMEOUT_MS,
      {
        posts: fallbackTwitterPosts(scripts),
      }
    )
    const twitterPosts = scripts.map((script, index) => ({
      scriptId: script.id,
      text: twitter.posts.find((post) => post.scriptIndex === index + 1)?.text ?? '',
    }))

    if (!twitter.posts?.length) {
      warnings.push('Twitter generation returned no posts; used fallback copy.')
    }

    const existingLookup = await getExistingEnrichment(runId)
    if (existingLookup.kind === 'unavailable') {
      warnings.push(existingLookup.reason)
    }

    const hasActiveVideoJob =
      existingLookup.kind === 'found' &&
      existingLookup.enrichment.firstScriptVideo?.jobId &&
      (existingLookup.enrichment.firstScriptVideo.status === 'queued' ||
        existingLookup.enrichment.firstScriptVideo.status === 'processing')

    let firstScriptVideo: FirstScriptVideo
    if (hasActiveVideoJob) {
      firstScriptVideo = {
        status: existingLookup.kind === 'found' ? existingLookup.enrichment.firstScriptVideo?.status ?? 'queued' : 'queued',
        jobId: existingLookup.kind === 'found' ? existingLookup.enrichment.firstScriptVideo?.jobId : undefined,
        publicUrl: existingLookup.kind === 'found' ? existingLookup.enrichment.firstScriptVideo?.publicUrl : undefined,
        error: existingLookup.kind === 'found' ? existingLookup.enrichment.firstScriptVideo?.error : undefined,
      }
    } else {
      const renderResult = await createRenderVideoJob(runId, scripts[0])
      if (!renderResult.ok) {
        firstScriptVideo = {
          status: 'failed',
          error: renderResult.error,
        }
        warnings.push(`Video job enqueue failed: ${renderResult.error}`)
      } else {
        firstScriptVideo = {
          status: 'queued',
          jobId: renderResult.jobId,
        }
      }
    }
    const payload = { twitterPosts, firstScriptVideo }

    if (fallbackRun) {
      setRunEnrichment(runId, payload)
    }

    const persistResult = await maybePersistEnrichment(runId, payload)
    if (!persistResult.ok) {
      warnings.push(persistResult.reason)
    }

    return json(
      warnings.length
        ? {
            ...payload,
            warnings,
          }
        : payload
    )
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      500
    )
  }
}
