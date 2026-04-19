import type { SourceDocument, SourceResult } from './types.js'

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

export const normalizeSerpPayload = (query: string, payload: unknown): SourceResult[] => {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const source = payload as {
    results?: unknown[]
    organic?: unknown[]
    organic_results?: unknown[]
    data?: { results?: unknown[] }
  }

  const rows = source.results ?? source.organic ?? source.organic_results ?? source.data?.results ?? []
  if (!Array.isArray(rows)) {
    return []
  }

  return rows
    .map((row, index) => {
      const item = row as Record<string, unknown>
      const url = asString(item.url) || asString(item.link)
      const title = asString(item.title)
      if (!url || !title) {
        return null
      }

      return {
        query,
        rank: Number(item.rank ?? index + 1),
        title,
        url,
        snippet: asString(item.snippet) || asString(item.description),
        source: asString(item.source, 'organic'),
      } satisfies SourceResult
    })
    .filter((item): item is SourceResult => item !== null)
}

export const normalizeScrapePayload = (
  payload: unknown,
  requestedUrls: string[]
): SourceDocument[] => {
  if (!payload || typeof payload !== 'object') {
    return requestedUrls.map((url) => ({
      url,
      title: url,
      extractedText: '',
    }))
  }

  const source = payload as {
    documents?: unknown[]
    results?: unknown[]
    data?: { results?: unknown[] }
  }

  const rows = source.documents ?? source.results ?? source.data?.results ?? []
  if (!Array.isArray(rows)) {
    return requestedUrls.map((url) => ({
      url,
      title: url,
      extractedText: '',
    }))
  }

  return rows
    .map((row, index): SourceDocument | null => {
      const item = row as Record<string, unknown>
      const url = asString(item.url) || requestedUrls[index]
      if (!url) {
        return null
      }

      const baseDocument = {
        url,
        title: asString(item.title, url),
        extractedText:
          asString(item.extracted_text) || asString(item.content) || asString(item.text),
      }

      const providerRequestId = asString(item.request_id)
      if (providerRequestId) {
        return { ...baseDocument, providerRequestId }
      }

      return baseDocument
    })
    .filter((item): item is SourceDocument => item !== null)
}
