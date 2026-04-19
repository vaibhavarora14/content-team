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

const maybePersistEnrichment = async (
  runId: string,
  payload: {
    twitterPosts: Array<{ scriptId: string; text: string }>
    firstScriptVideo: FirstScriptVideo
  }
) => {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('run_enrichments').upsert(
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
    )
  } catch {
    // Local/dev environments may not have run_enrichments yet.
  }
}

const getExistingEnrichment = async (runId: string) => {
  const fallbackRun = getRun(runId)
  if (fallbackRun?.enrichment) {
    return fallbackRun.enrichment
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase.from('run_enrichments').select('*').eq('run_id', runId).maybeSingle()
    if (!data) {
      return null
    }

    return {
      twitterPosts: (data.twitter_posts_json as Array<{ scriptId: string; text: string }>) ?? [],
      firstScriptVideo: {
        status: data.video_status ?? 'queued',
        jobId: data.video_job_id ?? undefined,
        publicUrl: data.video_url ?? undefined,
        error: data.video_error ?? undefined,
      } as FirstScriptVideo,
    }
  } catch {
    return null
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

    const fallbackRun = getRun(runId)
    let brandBrief = fallbackRun?.brandBrief ?? ''
    if (!brandBrief) {
      try {
        const supabase = getSupabaseAdmin()
        const { data } = await supabase.from('search_runs').select('brand_brief').eq('id', runId).single()
        brandBrief = data?.brand_brief ?? ''
      } catch {
        brandBrief = ''
      }
    }

    const twitter = await generateTwitterPosts({
      brandBrief,
      scripts,
    })
    const twitterPosts = scripts.map((script, index) => ({
      scriptId: script.id,
      text: twitter.posts.find((post) => post.scriptIndex === index + 1)?.text ?? '',
    }))

    const existingEnrichment = await getExistingEnrichment(runId)
    const hasActiveVideoJob =
      existingEnrichment?.firstScriptVideo?.jobId &&
      (existingEnrichment.firstScriptVideo.status === 'queued' ||
        existingEnrichment.firstScriptVideo.status === 'processing')

    let firstScriptVideo: FirstScriptVideo
    if (hasActiveVideoJob) {
      firstScriptVideo = {
        status: existingEnrichment?.firstScriptVideo?.status ?? 'queued',
        jobId: existingEnrichment?.firstScriptVideo?.jobId,
        publicUrl: existingEnrichment?.firstScriptVideo?.publicUrl,
        error: existingEnrichment?.firstScriptVideo?.error,
      }
    } else {
      const renderResult = await createRenderVideoJob(runId, scripts[0])
      firstScriptVideo = renderResult.ok
        ? {
            status: 'queued',
            jobId: renderResult.jobId,
          }
        : {
            status: 'failed',
            error: renderResult.error,
          }
    }
    const payload = { twitterPosts, firstScriptVideo }

    if (fallbackRun) {
      setRunEnrichment(runId, payload)
    } else {
      await maybePersistEnrichment(runId, payload)
    }

    return json(payload)
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      500
    )
  }
}
