export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })

export const parseJsonBody = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

export const normalizeBaseUrl = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim() || fallback
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}
