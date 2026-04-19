import { normalizeBaseUrl } from './http.js'
import { optionalEnv } from './supabase.js'
import type { VideoScript } from './types.js'
import type { EnrichmentStage, TwitterStatus } from './enrichment.js'

export type VideoJobStatus = 'not_started' | 'queued' | 'processing' | 'completed' | 'failed'

type WorkerCreateResponse = {
  jobId?: string
  id?: string
  error?: string
  message?: string
  data?: {
    jobId?: string
    id?: string
    error?: string
    message?: string
  }
}

type WorkerStatusResponse = {
  videoStatus?: string
  status?: string
  state?: string
  stage?: string
  publicUrl?: string
  videoUrl?: string
  url?: string
  twitterStatus?: string
  twitterPosts?: Array<{ scriptId?: string; text?: string }>
  error?: string
  message?: string
  data?: {
    videoStatus?: string
    status?: string
    state?: string
    stage?: string
    publicUrl?: string
    videoUrl?: string
    url?: string
    twitterStatus?: string
    twitterPosts?: Array<{ scriptId?: string; text?: string }>
    error?: string
    message?: string
  }
}

const buildNarrationScript = (script: VideoScript) =>
  script.voiceoverScript?.trim()
    ? script.voiceoverScript.trim()
    : `${script.title}

Hook: ${script.hook}
Body:
${script.bodyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')}
CTA: ${script.cta}`

const getWorkerBaseUrl = () => optionalEnv('RENDER_VIDEO_WORKER_URL')

const getWorkerHeaders = () => ({
  'Content-Type': 'application/json',
  ...(optionalEnv('RENDER_VIDEO_WORKER_SECRET')
    ? { Authorization: `Bearer ${optionalEnv('RENDER_VIDEO_WORKER_SECRET')}` }
    : {}),
})

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutHandle)
  }
}

const mapWorkerStatus = (value: string | undefined): VideoJobStatus => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'not_started' || normalized === 'not-started') {
    return 'not_started'
  }
  if (normalized === 'done' || normalized === 'success' || normalized === 'completed') {
    return 'completed'
  }
  if (normalized === 'error' || normalized === 'failed') {
    return 'failed'
  }
  if (normalized === 'running' || normalized === 'processing' || normalized === 'in_progress') {
    return 'processing'
  }
  return 'queued'
}

export const createRenderVideoJob = async (
  runId: string,
  input: {
    firstScript: VideoScript & { id: string }
    scripts: Array<VideoScript & { id: string }>
    brandBrief?: string
    startVideo?: boolean
  }
): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> => {
  const baseUrl = getWorkerBaseUrl()
  if (!baseUrl) {
    return { ok: false, error: 'Missing RENDER_VIDEO_WORKER_URL' }
  }

  const createUrl = `${normalizeBaseUrl(baseUrl, baseUrl)}/jobs`

  try {
    const response = await fetchWithTimeout(
      createUrl,
      {
      method: 'POST',
      headers: getWorkerHeaders(),
      body: JSON.stringify({
        runId,
        scriptId: input.firstScript.id,
        script: input.firstScript,
        scripts: input.scripts,
        brandBrief: input.brandBrief ?? '',
        startVideo: input.startVideo ?? true,
        scriptText: buildNarrationScript(input.firstScript),
      }),
      },
      15000
    )

    const payload = (await response.json().catch(() => null)) as WorkerCreateResponse | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          payload?.error ||
          payload?.message ||
          payload?.data?.error ||
          payload?.data?.message ||
          `Render worker create-job failed with ${response.status}`,
      }
    }

    const jobId = payload?.jobId || payload?.id || payload?.data?.jobId || payload?.data?.id
    if (!jobId) {
      return {
        ok: false,
        error: 'Render worker did not return jobId.',
      }
    }

    return { ok: true, jobId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to reach Render worker.',
    }
  }
}

export const getRenderVideoJobStatus = async (
  jobId: string
): Promise<
  | {
      ok: true
      status: VideoJobStatus
      stage?: EnrichmentStage
      publicUrl?: string
      twitterStatus?: TwitterStatus
      twitterPosts?: Array<{ scriptId: string; text: string }>
      error?: string
    }
  | { ok: false; error: string }
> => {
  const baseUrl = getWorkerBaseUrl()
  if (!baseUrl) {
    return { ok: false, error: 'Missing RENDER_VIDEO_WORKER_URL' }
  }

  const statusUrl = `${normalizeBaseUrl(baseUrl, baseUrl)}/jobs/${encodeURIComponent(jobId)}`

  try {
    const response = await fetchWithTimeout(
      statusUrl,
      {
        method: 'GET',
        headers: getWorkerHeaders(),
      },
      12000
    )

    const payload = (await response.json().catch(() => null)) as WorkerStatusResponse | null
    if (!response.ok) {
      return {
        ok: false,
        error:
          payload?.error ||
          payload?.message ||
          payload?.data?.error ||
          payload?.data?.message ||
          `Render worker status failed with ${response.status}`,
      }
    }

    const rawStatus =
      payload?.videoStatus || payload?.data?.videoStatus || payload?.status || payload?.state || payload?.data?.status || payload?.data?.state
    const status = mapWorkerStatus(rawStatus)
    const rawStage = payload?.stage || payload?.data?.stage
    const stage =
      rawStage === 'queued' ||
      rawStage === 'twitter' ||
      rawStage === 'video' ||
      rawStage === 'voiceover' ||
      rawStage === 'stitch' ||
      rawStage === 'upload' ||
      rawStage === 'completed' ||
      rawStage === 'failed'
        ? rawStage
        : undefined
    const publicUrl =
      payload?.publicUrl || payload?.videoUrl || payload?.url || payload?.data?.publicUrl || payload?.data?.videoUrl || payload?.data?.url
    const rawTwitterStatus = payload?.twitterStatus || payload?.data?.twitterStatus
    const twitterStatus =
      rawTwitterStatus === 'pending' ||
      rawTwitterStatus === 'processing' ||
      rawTwitterStatus === 'completed' ||
      rawTwitterStatus === 'failed'
        ? rawTwitterStatus
        : undefined
    const twitterPosts = (payload?.twitterPosts || payload?.data?.twitterPosts || [])
      .map((post) => ({
        scriptId: typeof post?.scriptId === 'string' ? post.scriptId : '',
        text: typeof post?.text === 'string' ? post.text : '',
      }))
      .filter((post) => post.scriptId && post.text)
    const error = payload?.error || payload?.message || payload?.data?.error || payload?.data?.message

    return { ok: true, status, stage, publicUrl, twitterStatus, twitterPosts, error }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to reach Render worker status API.',
    }
  }
}
