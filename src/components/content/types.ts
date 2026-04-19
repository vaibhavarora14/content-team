export type DerivedQuery = {
  query: string
  intent: string
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
  id: string
  url: string
  title: string
  preview: string
}

export type TopicCandidate = {
  id: string
  title: string
  angle: string
  whyNow: string
  confidence: number
  sourceResultIds: string[]
}

export type VideoScript = {
  id: string
  title: string
  hook: string
  bodyPoints: string[]
  cta: string
  durationSec: number
  voiceoverScript?: string
  twitterPost?: string
  twitterStatus?: 'pending' | 'processing' | 'completed' | 'failed'
  videoStatus?: 'not_started' | 'queued' | 'processing' | 'completed' | 'failed'
  enrichmentStage?: 'queued' | 'twitter' | 'video' | 'voiceover' | 'stitch' | 'upload' | 'completed' | 'failed'
  videoJobId?: string
  videoUrl?: string
  videoError?: string
}
