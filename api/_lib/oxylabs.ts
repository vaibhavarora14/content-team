import { normalizeBaseUrl } from './http.js'
import { normalizeScrapePayload, normalizeSerpPayload } from './research-normalizer.js'
import { optionalEnv, requireEnv } from './supabase.js'
import type { SourceDocument, SourceResult } from './types.js'

const DEFAULT_SERP_ENDPOINT = 'https://realtime.oxylabs.io/v1/queries'
const DEFAULT_SCRAPE_ENDPOINT = 'https://realtime.oxylabs.io/v1/queries'

const buildBasicAuth = () => {
  const username = requireEnv('OXYLABS_USERNAME')
  const password = requireEnv('OXYLABS_PASSWORD')
  return `Basic ${btoa(`${username}:${password}`)}`
}

const mockSearchResults = (query: string): SourceResult[] =>
  [1, 2, 3, 4, 5].map((rank) => ({
    query,
    rank,
    title: `${query} insight ${rank}`,
    url: `https://example.com/${encodeURIComponent(query)}/${rank}`,
    snippet: `Mock result ${rank} for ${query}. Configure Oxylabs credentials for live data.`,
    source: 'mock',
  }))

export const searchKeyword = async (input: {
  query: string
  gl: string
  hl: string
  topN: number
}): Promise<{
  results: SourceResult[]
  queryLatencyMs: number
  providerRequestId?: string
}> => {
  const endpoint = normalizeBaseUrl(optionalEnv('OXYLABS_SERP_ENDPOINT'), DEFAULT_SERP_ENDPOINT)
  const startedAt = Date.now()

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildBasicAuth(),
      },
      body: JSON.stringify({
        source: 'google_search',
        query: input.query,
        parse: true,
        context: [
          { key: 'gl', value: input.gl },
          { key: 'hl', value: input.hl },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`SERP request failed with ${response.status}`)
    }

    const payload = (await response.json()) as unknown
    const results = normalizeSerpPayload(input.query, payload).slice(0, input.topN)
    return {
      results: results.length ? results : mockSearchResults(input.query),
      queryLatencyMs: Date.now() - startedAt,
      providerRequestId: response.headers.get('x-request-id') ?? undefined,
    }
  } catch {
    return {
      results: mockSearchResults(input.query),
      queryLatencyMs: Date.now() - startedAt,
    }
  }
}

export const scrapeUrls = async (urls: string[]): Promise<{
  documents: SourceDocument[]
  providerRequestId?: string
}> => {
  if (!urls.length) {
    return { documents: [] }
  }

  const endpoint = normalizeBaseUrl(
    optionalEnv('OXYLABS_SCRAPE_ENDPOINT'),
    DEFAULT_SCRAPE_ENDPOINT
  )

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildBasicAuth(),
      },
      body: JSON.stringify({
        source: 'universal',
        urls,
        parse: true,
      }),
    })

    if (!response.ok) {
      throw new Error(`Scrape request failed with ${response.status}`)
    }

    const payload = (await response.json()) as unknown
    return {
      documents: normalizeScrapePayload(payload, urls),
      providerRequestId: response.headers.get('x-request-id') ?? undefined,
    }
  } catch {
    return {
      documents: urls.map((url) => ({
        url,
        title: url,
        extractedText: '',
      })),
    }
  }
}
