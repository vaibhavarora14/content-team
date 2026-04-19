const http = require('http')
const crypto = require('crypto')
const { URL } = require('url')

const { runReelPipeline } = require('./video-creation/src/pipeline')

const port = Number(process.env.PORT || 10000)
const workerSecret = process.env.RENDER_VIDEO_WORKER_SECRET || ''

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
  if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') {
    return status
  }
  return 'failed'
}

const createIdempotencyKey = (runId, scriptId, scriptText) =>
  crypto.createHash('sha256').update(`${runId}::${scriptId}::${scriptText}`).digest('hex')

const processJob = async (jobId) => {
  const job = jobs.get(jobId)
  if (!job || job.status !== 'queued') {
    return
  }

  job.status = 'processing'
  job.updatedAt = new Date().toISOString()

  try {
    const output = await runReelPipeline(job.scriptText)
    job.status = 'completed'
    job.publicUrl = output
    job.updatedAt = new Date().toISOString()
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : 'Unknown worker error'
    job.updatedAt = new Date().toISOString()
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
      const requestedStatus = normalizeJobStatus(body.status)

      if (!runId || !scriptId || !scriptText) {
        json(res, 400, { error: 'runId, scriptId and scriptText are required.' })
        return
      }

      const idempotencyKey = createIdempotencyKey(runId, scriptId, scriptText)
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
        status: requestedStatus === 'failed' ? 'failed' : 'queued',
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
