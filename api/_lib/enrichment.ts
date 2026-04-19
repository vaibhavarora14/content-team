export type EnrichmentStage =
  | 'queued'
  | 'twitter'
  | 'video'
  | 'voiceover'
  | 'stitch'
  | 'upload'
  | 'completed'
  | 'failed'

export type TwitterStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type TwitterPostRecord = {
  scriptId: string
  text: string
}

export type TwitterStatePayload = {
  status: TwitterStatus
  posts: TwitterPostRecord[]
  error?: string
}

export const normalizeTwitterState = (value: unknown): TwitterStatePayload => {
  if (Array.isArray(value)) {
    return {
      status: value.length ? 'completed' : 'pending',
      posts: value
        .map((item) => ({
          scriptId: typeof (item as { scriptId?: string })?.scriptId === 'string' ? (item as { scriptId: string }).scriptId : '',
          text: typeof (item as { text?: string })?.text === 'string' ? (item as { text: string }).text : '',
        }))
        .filter((post) => post.scriptId && post.text),
    }
  }

  if (value && typeof value === 'object') {
    const payload = value as {
      status?: string
      posts?: Array<{ scriptId?: string; text?: string }>
      error?: string
    }
    const normalizedStatus =
      payload.status === 'pending' ||
      payload.status === 'processing' ||
      payload.status === 'completed' ||
      payload.status === 'failed'
        ? payload.status
        : 'pending'

    return {
      status: normalizedStatus,
      posts: (payload.posts ?? [])
        .map((post) => ({
          scriptId: typeof post.scriptId === 'string' ? post.scriptId : '',
          text: typeof post.text === 'string' ? post.text : '',
        }))
        .filter((post) => post.scriptId && post.text),
      error: typeof payload.error === 'string' ? payload.error : undefined,
    }
  }

  return {
    status: 'pending',
    posts: [],
  }
}

