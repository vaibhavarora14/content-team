import { generateTopics } from './llm.js'
import type { SourceDocument, SourceResult, TopicCandidate } from './types.js'

const toResultSnippet = (result: SourceResult, index: number) =>
  `[Result ${index + 1}] query=${result.query}\n${result.title}\n${result.snippet}\n${result.url}`

const toDocumentSnippet = (document: SourceDocument, index: number) =>
  `[Document ${index + 1}] ${document.title}\n${document.extractedText.slice(0, 700)}`

export const extractTopicsFromResearch = async (input: {
  brandBrief: string
  sourceResults: SourceResult[]
  sourceDocuments: SourceDocument[]
}) => {
  const researchSnippets = [
    ...input.sourceResults.slice(0, 10).map(toResultSnippet),
    ...input.sourceDocuments.slice(0, 5).map(toDocumentSnippet),
  ]

  const { topics, usage } = await generateTopics({
    brandBrief: input.brandBrief,
    researchSnippets,
  })

  const normalizedTopics: TopicCandidate[] = topics.map((topic) => ({
    ...topic,
    sourceResultIds: topic.sourceResultIds ?? [],
    confidence: Math.max(0, Math.min(1, topic.confidence)),
  }))

  return { topics: normalizedTopics, usage }
}
