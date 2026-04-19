const http = require('http')
const crypto = require('crypto')
const { URL } = require('url')

const port = Number(process.env.PORT || 10000)
const workerSecret = process.env.RENDER_VIDEO_WORKER_SECRET || ''
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const llmBaseUrl = (process.env.LLM_BASE_URL || 'https://opencode.ai/zen/v1').replace(/\/$/, '')
const llmApiKey = process.env.LLM_API_KEY || ''
const llmModel = process.env.LLM_MODEL || 'gpt-5.4-mini'

const jobs = new Map()

const json = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

const unauthorized = (res) => json(res, 401, { error: 'Unauthorized' })

const isAuthorized = (req) => {
  if (!workerSecret) {
    return true
  }
  const auth = req.headers.authorization || ''
  return auth === `Bearer ${workerSecret}`
}

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8')
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'))
      }
    })
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })

const normalizeJobStatus = (status) => {
  if (typeof status !== 'string' || !status.trim()) {
    return 'queued'
  }
  if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') {
    return status
  }
  return 'queued'
}

const createIdempotencyKey = (runId, scriptId, scriptText, startVideo) =>
  crypto.createHash('sha256').update(`${runId}::${scriptId}::${scriptText}::${startVideo ? 'video' : 'twitter'}`).digest('hex')

const mapJobToEnrichment = (job) => ({
  runId: job.runId,
  stage: job.stage || (job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : 'video'),
  twitterStatus: job.twitterStatus || 'pending',
  twitterPosts: Array.isArray(job.twitterPosts) ? job.twitterPosts : [],
  firstScriptVideo: {
    status: job.videoStatus || 'queued',
    jobId: job.jobId,
    publicUrl: job.publicUrl || undefined,
    error: job.error || undefined,
  },
})

const persistEnrichment = async (job) => {
  if (!supabaseUrl || !supabaseServiceKey) {
    return
  }

  const row = {
    run_id: job.runId,
    twitter_posts_json: {
      status: job.twitterStatus || 'pending',
      posts: Array.isArray(job.twitterPosts) ? job.twitterPosts : [],
      error: job.twitterError || null,
    },
    video_job_id: job.jobId,
    video_status: job.videoStatus || job.status,
    video_url: job.publicUrl || null,
    video_error: job.error || null,
    updated_at: new Date().toISOString(),
  }

  try {
    await fetch(`${supabaseUrl}/rest/v1/run_enrichments?on_conflict=run_id`, {
      method: 'POST',
      headers: {
        apikey: supabaseServiceKey,
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    })
  } catch {}
}

const fallbackTwitterPosts = (scripts) =>
  (scripts || []).map((script, index) => ({
    scriptId: script.id,
    text: `${script.hook || ''} ${script.cta || ''}`.trim().slice(0, 280),
    scriptIndex: index + 1,
  }))

const extractResponseText = (payload) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text
  }
  return (
    payload?.output
      ?.flatMap((entry) => entry?.content || [])
      .map((entry) => entry?.text || '')
      .find((text) => String(text).trim().length > 0) || ''
  )
}

const generateTwitterPostsInWorker = async ({ brandBrief, scripts }) => {
  const fallback = fallbackTwitterPosts(scripts)
  if (!scripts?.length) {
    return []
  }
  if (!llmApiKey) {
    return fallback
  }

  const prompt = `
You are a social media writer for X (Twitter).
Output strict JSON only.

Schema:
{
  "posts": [
    { "scriptIndex": 1, "text": "string" }
  ]
}

Rules:
- Return exactly ${scripts.length} posts.
- scriptIndex starts at 1 in the same order as scripts.
- Each post under 280 characters.
- No URLs.

Brand brief:
${brandBrief || ''}

Scripts:
${scripts
  .map(
    (script, index) =>
      `${index + 1}. ${script.title}\nHook: ${script.hook}\nBody: ${(script.bodyPoints || []).join(' | ')}\nCTA: ${script.cta}`
  )
  .join('\n\n')}
`.trim()

  try {
    const response = await fetch(`${llmBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${llmApiKey}`,
      },
      body: JSON.stringify({
        model: llmModel,
        input: prompt,
        temperature: 0.4,
      }),
    })
    if (!response.ok) {
      return fallback
    }
    const payload = await response.json()
    const parsed = JSON.parse(extractResponseText(payload))
    const posts = (parsed?.posts || [])
      .map((post, index) => ({
        scriptId: scripts[(post.scriptIndex || index + 1) - 1]?.id || scripts[index]?.id,
        text: String(post.text || '').trim().slice(0, 280),
      }))
      .filter((post) => post.scriptId && post.text)
    return posts.length ? posts : fallback
  } catch {
    return fallback
  }
}

const processJob = async (jobId) => {
  const job = jobs.get(jobId)
  if (!job || job.status !== 'queued') {
    return
  }

  job.status = 'processing'
  job.stage = 'twitter'
  job.twitterStatus = 'processing'
  job.updatedAt = new Date().toISOString()
  await persistEnrichment(job)

  try {
    job.twitterPosts = await generateTwitterPostsInWorker({
      brandBrief: job.brandBrief || '',
      scripts: job.scripts || [],
    })
    job.twitterStatus = 'completed'
    job.updatedAt = new Date().toISOString()
    await persistEnrichment(job)

    if (!job.startVideo) {
      job.status = 'completed'
      job.stage = 'completed'
      job.videoStatus = 'not_started'
      job.updatedAt = new Date().toISOString()
      await persistEnrichment(job)
      return
    }

    job.stage = 'video'
    job.videoStatus = 'processing'
    job.updatedAt = new Date().toISOString()
    await persistEnrichment(job)

    const { runReelPipeline } = require('./video-creation/src/pipeline')
    const output = await runReelPipeline(
      job.scriptText,
      undefined,
      async (stage) => {
        job.stage = stage
        job.updatedAt = new Date().toISOString()
        await persistEnrichment(job)
      }
    )
    job.status = 'completed'
    job.stage = 'completed'
    job.videoStatus = 'completed'
    job.publicUrl = output
    job.updatedAt = new Date().toISOString()
    await persistEnrichment(job)
  } catch (error) {
    job.status = 'failed'
    job.stage = 'failed'
    job.videoStatus = job.startVideo ? 'failed' : 'not_started'
    job.error = error instanceof Error ? error.message : 'Unknown worker error'
    job.twitterStatus = job.twitterStatus === 'completed' ? 'completed' : 'failed'
    job.twitterError = job.twitterStatus === 'failed' ? job.error : null
    job.updatedAt = new Date().toISOString()
    await persistEnrichment(job)
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host}`)
    const pathname = requestUrl.pathname

    if (pathname === '/health' && req.method === 'GET') {
      json(res, 200, { ok: true })
      return
    }

    if (pathname === '/jobs' && req.method === 'POST') {
      if (!isAuthorized(req)) {
        unauthorized(res)
        return
      }

      const body = await readJsonBody(req)
      const runId = (body.runId || '').trim()
      const scriptId = (body.scriptId || '').trim()
      const scriptText = typeof body.scriptText === 'string' ? body.scriptText.trim() : ''
      const scripts = Array.isArray(body.scripts) ? body.scripts : []
      const brandBrief = typeof body.brandBrief === 'string' ? body.brandBrief : ''
      const startVideo = body.startVideo !== false
      const requestedStatus = normalizeJobStatus(body.status)

      if (!runId || !scriptId || !scriptText) {
        json(res, 400, { error: 'runId, scriptId and scriptText are required.' })
        return
      }

      const idempotencyKey = createIdempotencyKey(runId, scriptId, scriptText, startVideo)
      const existing = [...jobs.values()].find((job) => job.idempotencyKey === idempotencyKey)
      if (existing) {
        json(res, 200, { jobId: existing.jobId, status: existing.status })
        return
      }

      const jobId = crypto.randomUUID()
      const createdAt = new Date().toISOString()
      jobs.set(jobId, {
        jobId,
        runId,
        scriptId,
        scriptText,
        scripts,
        brandBrief,
        startVideo,
        status: requestedStatus === 'failed' ? 'failed' : 'queued',
        videoStatus: startVideo ? 'queued' : 'not_started',
        stage: requestedStatus === 'failed' ? 'failed' : 'queued',
        twitterStatus: 'pending',
        twitterPosts: [],
        twitterError: null,
        idempotencyKey,
        createdAt,
        updatedAt: createdAt,
        publicUrl: null,
        error: requestedStatus === 'failed' ? 'Failed before queueing.' : null,
      })

      setTimeout(() => {
        void processJob(jobId)
      }, 10)

      json(res, 200, { jobId, status: 'queued' })
      return
    }

    if (pathname.startsWith('/jobs/') && req.method === 'GET') {
      if (!isAuthorized(req)) {
        unauthorized(res)
        return
      }

      const jobId = pathname.split('/').pop()
      const job = jobId ? jobs.get(jobId) : null
      if (!job) {
        json(res, 404, { error: 'Job not found.' })
        return
      }

      json(res, 200, {
        jobId: job.jobId,
        runId: job.runId,
        scriptId: job.scriptId,
        status: job.status,
        videoStatus: job.videoStatus,
        stage: job.stage || undefined,
        twitterStatus: job.twitterStatus || undefined,
        twitterPosts: job.twitterPosts || [],
        publicUrl: job.publicUrl || undefined,
        error: job.error || undefined,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })
      return
    }

    json(res, 404, { error: 'Not Found' })
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Unexpected worker error.' })
  }
})

server.listen(port, () => {
  console.log(`Video worker listening on port ${port}`)
})
