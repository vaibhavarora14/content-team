import { normalizeBaseUrl } from './http.js'
import { optionalEnv } from './supabase.js'
import type { VideoScript } from './types.js'

export type VideoJobStatus = 'queued' | 'processing' | 'completed' | 'failed'

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
  status?: string
  state?: string
  publicUrl?: string
  videoUrl?: string
  url?: string
  error?: string
  message?: string
  data?: {
    status?: string
    state?: string
    publicUrl?: string
    videoUrl?: string
    url?: string
    error?: string
    message?: string
  }
}

const buildNarrationScript = (script: VideoScript) =>
  `${script.title}

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
  firstScript: VideoScript & { id: string }
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
        scriptId: firstScript.id,
        script: firstScript,
        scriptText: buildNarrationScript(firstScript),
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
  | { ok: true; status: VideoJobStatus; publicUrl?: string; error?: string }
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

    const rawStatus = payload?.status || payload?.state || payload?.data?.status || payload?.data?.state
    const status = mapWorkerStatus(rawStatus)
    const publicUrl =
      payload?.publicUrl || payload?.videoUrl || payload?.url || payload?.data?.publicUrl || payload?.data?.videoUrl || payload?.data?.url
    const error = payload?.error || payload?.message || payload?.data?.error || payload?.data?.message

    return { ok: true, status, publicUrl, error }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to reach Render worker status API.',
    }
  }
}
