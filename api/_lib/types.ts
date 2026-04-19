export type DerivedQuery = {
  query: string
  intent: 'educational' | 'comparison' | 'trend' | 'problem'
}

export type SourceResult = {
  query: string
  rank: number
  title: string
  url: string
  snippet: string
  source: string
}

export type SourceDocument = {
  sourceResultId?: string
  url: string
  title: string
  extractedText: string
  providerRequestId?: string
}

export type TopicCandidate = {
  title: string
  angle: string
  whyNow: string
  sourceResultIds: string[]
  confidence: number
}

export type VideoScript = {
  title: string
  hook: string
  bodyPoints: string[]
  cta: string
  durationSec: number
}

export type LlmUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}
