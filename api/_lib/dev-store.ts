import type {
  DerivedQuery,
  SourceDocument,
  SourceResult,
  TopicCandidate,
  VideoScript,
} from './types.js'

type RunRecord = {
  id: string
  brandBrief: string
  gl: string
  hl: string
  derivedQueries: DerivedQuery[]
  status: string
  sourceResults: Array<SourceResult & { id: string }>
  sourceDocuments: Array<SourceDocument & { id: string }>
  topicCandidates: Array<TopicCandidate & { id: string }>
  videoScripts: Array<VideoScript & { id: string }>
  createdAt: string
}

const getStore = () => {
  const key = '__brandBriefDevStore'
  const globalRef = globalThis as Record<string, unknown>
  if (!globalRef[key]) {
    globalRef[key] = new Map<string, RunRecord>()
  }
  return globalRef[key] as Map<string, RunRecord>
}

export const createRun = (input: {
  brandBrief: string
  gl: string
  hl: string
  derivedQueries: DerivedQuery[]
}) => {
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const run: RunRecord = {
    id,
    brandBrief: input.brandBrief,
    gl: input.gl,
    hl: input.hl,
    derivedQueries: input.derivedQueries,
    status: 'search_started',
    sourceResults: [],
    sourceDocuments: [],
    topicCandidates: [],
    videoScripts: [],
    createdAt,
  }
  getStore().set(id, run)
  return run
}

export const getRun = (id: string) => getStore().get(id)

export const setRunStatus = (id: string, status: string) => {
  const run = getRun(id)
  if (run) {
    run.status = status
  }
}

export const setRunSourceResults = (id: string, results: SourceResult[]) => {
  const run = getRun(id)
  if (!run) {
    return []
  }

  run.sourceResults = results.map((result) => ({
    ...result,
    id: crypto.randomUUID(),
  }))

  return run.sourceResults
}

export const setRunSourceDocuments = (id: string, documents: SourceDocument[]) => {
  const run = getRun(id)
  if (!run) {
    return []
  }

  run.sourceDocuments = documents.map((document) => ({
    ...document,
    id: crypto.randomUUID(),
  }))

  return run.sourceDocuments
}

export const setRunTopics = (id: string, topics: TopicCandidate[]) => {
  const run = getRun(id)
  if (!run) {
    return []
  }

  run.topicCandidates = topics.map((topic) => ({
    ...topic,
    id: crypto.randomUUID(),
  }))

  return run.topicCandidates
}

export const setRunScripts = (id: string, scripts: VideoScript[]) => {
  const run = getRun(id)
  if (!run) {
    return []
  }

  run.videoScripts = scripts.map((script) => ({
    ...script,
    id: crypto.randomUUID(),
  }))

  return run.videoScripts
}
