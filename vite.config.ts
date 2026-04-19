import { defineConfig } from 'vite'
import type { Connect, Plugin, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

const routeTable = [
  { pattern: /^\/api\/messages\/?$/, modulePath: '/api/messages.ts' },
  { pattern: /^\/api\/research\/search\/?$/, modulePath: '/api/research/search.ts' },
  { pattern: /^\/api\/research\/scrape\/?$/, modulePath: '/api/research/scrape.ts' },
  { pattern: /^\/api\/topics\/extract\/?$/, modulePath: '/api/topics/extract.ts' },
  { pattern: /^\/api\/scripts\/generate\/?$/, modulePath: '/api/scripts/generate.ts' },
  { pattern: /^\/api\/runs\/?$/, modulePath: '/api/runs/index.ts' },
  { pattern: /^\/api\/runs\/get\/?$/, modulePath: '/api/runs/get.ts' },
  { pattern: /^\/api\/runs\/[^/]+\/?$/, modulePath: '/api/runs/[id].ts' },
]

const loadLocalServerEnv = () => {
  const envPath = path.resolve(__dirname, '.env.local')
  if (!fs.existsSync(envPath)) {
    return
  }

  const contents = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    const value = rawValue.replace(/^"(.*)"$/, '$1')
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

const readBody = async (req: Connect.IncomingMessage) =>
  await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

const localApiPlugin = (): Plugin => ({
  name: 'local-api-plugin',
  apply: 'serve',
  configureServer(server: ViteDevServer) {
    loadLocalServerEnv()
    server.middlewares.use(async (req, res, next) => {
      const method = req.method ?? 'GET'
      const requestUrl = req.url ?? '/'

      if (!requestUrl.startsWith('/api/')) {
        return next()
      }

      const pathname = requestUrl.split('?')[0]
      const route = routeTable.find((item) => item.pattern.test(pathname))
      if (!route) {
        res.statusCode = 404
        res.end()
        return
      }

      if (method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        res.end()
        return
      }

      try {
        const mod = await server.ssrLoadModule(route.modulePath)
        const handler = mod.default as (request: Request) => Promise<Response>
        if (typeof handler !== 'function') {
          throw new Error(`No default handler exported by ${route.modulePath}`)
        }

        const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req)
        const url = `http://${req.headers.host ?? 'localhost'}${requestUrl}`
        const headers = new Headers()
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            headers.set(key, value)
          }
        }

        const response = await handler(
          new Request(url, {
            method,
            headers,
            body,
          })
        )

        res.statusCode = response.status
        response.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })

        const data = Buffer.from(await response.arrayBuffer())
        res.end(data)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected local API error.'
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: message }))
      }
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
