import { normalizeBaseUrl } from './http.js'
import { buildRepairPrompt, buildScriptsPrompt, buildTopicsPrompt, buildTwitterPostsPrompt } from './prompts.js'
import { optionalEnv } from './supabase.js'
import type { LlmUsage, TopicCandidate, TwitterPost, VideoScript } from './types.js'

const getConfig = () => ({
  baseUrl: normalizeBaseUrl(optionalEnv('LLM_BASE_URL'), 'https://opencode.ai/zen/v1'),
  model: optionalEnv('LLM_MODEL') ?? 'gpt-5.4-mini',
  apiKey: optionalEnv('LLM_API_KEY'),
})

const extractResponseText = (payload: unknown) => {
  const response = payload as {
    output_text?: string
    output?: Array<{ content?: Array<{ text?: string }> }>
  }

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text
  }

  return (
    response.output
      ?.flatMap((entry) => entry.content ?? [])
      .map((entry) => entry.text ?? '')
      .find((text) => text.trim().length > 0) ?? ''
  )
}

const parseUsage = (payload: unknown): LlmUsage | undefined => {
  const response = payload as {
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  }
  if (!response.usage) {
    return undefined
  }
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    totalTokens: response.usage.total_tokens,
  }
}

const parseJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const callResponses = async (input: string) => {
  const { baseUrl, model, apiKey } = getConfig()
  if (!apiKey) {
    throw new Error('Missing LLM_API_KEY')
  }

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      temperature: 0.4,
    }),
  })

  if (!response.ok) {
    throw new Error(`LLM request failed with ${response.status}`)
  }

  return (await response.json()) as unknown
}

const fallbackTopics = (): TopicCandidate[] => [
  {
    title: 'Core benefits explained',
    angle: 'Educational breakdown',
    whyNow: 'Users are actively comparing options and need clear value framing.',
    sourceResultIds: [],
    confidence: 0.62,
  },
  {
    title: 'Pros and cons in one minute',
    angle: 'Balanced comparison',
    whyNow: 'Contrast formats convert well for decision-stage viewers.',
    sourceResultIds: [],
    confidence: 0.6,
  },
  {
    title: 'Common mistakes to avoid',
    angle: 'Problem-solution',
    whyNow: 'Mistake-first hooks increase retention in short-form feeds.',
    sourceResultIds: [],
    confidence: 0.58,
  },
  {
    title: 'Myth vs fact',
    angle: 'Myth busting',
    whyNow: 'Contrarian formats are highly shareable.',
    sourceResultIds: [],
    confidence: 0.57,
  },
]

const fallbackScripts = (count: number): VideoScript[] =>
  Array.from({ length: count }).map((_, index) => ({
    title: `Script ${index + 1}`,
    hook: 'Most people get this wrong. Here is the quick truth.',
    bodyPoints: [
      'Why this topic matters right now.',
      'One key insight from current market content.',
      'Actionable step viewers can apply immediately.',
    ],
    cta: 'Comment if you want part 2.',
    durationSec: 45,
  }))

const fallbackTwitterPosts = (scripts: VideoScript[]): TwitterPost[] =>
  scripts.map((script, index) => ({
    scriptIndex: index + 1,
    text: `${script.hook} ${script.cta}`.slice(0, 270),
  }))

export const generateTopics = async (input: {
  brandBrief: string
  researchSnippets: string[]
}) => {
  const prompt = buildTopicsPrompt(input)

  try {
    const payload = await callResponses(prompt)
    let parsed = parseJson<{ topics?: TopicCandidate[] }>(extractResponseText(payload))

    if (!parsed) {
      const repaired = await callResponses(buildRepairPrompt(extractResponseText(payload)))
      parsed = parseJson<{ topics?: TopicCandidate[] }>(extractResponseText(repaired))
    }

    const topics = parsed?.topics?.filter(Boolean)
    if (!topics?.length) {
      return { topics: fallbackTopics() }
    }

    return {
      topics: topics.slice(0, 6).map((topic) => ({
        ...topic,
        sourceResultIds: topic.sourceResultIds ?? [],
        confidence: Math.max(0, Math.min(1, topic.confidence ?? 0.6)),
      })),
      usage: parseUsage(payload),
    }
  } catch {
    return { topics: fallbackTopics() }
  }
}

export const generateScripts = async (input: {
  brandBrief: string
  topics: Array<{ title: string; angle: string; whyNow: string }>
  count: number
}) => {
  const count = Math.max(4, Math.min(5, input.count))
  const prompt = buildScriptsPrompt({
    brandBrief: input.brandBrief,
    topics: input.topics,
    count,
  })

  try {
    const payload = await callResponses(prompt)
    let parsed = parseJson<{ scripts?: VideoScript[] }>(extractResponseText(payload))

    if (!parsed) {
      const repaired = await callResponses(buildRepairPrompt(extractResponseText(payload)))
      parsed = parseJson<{ scripts?: VideoScript[] }>(extractResponseText(repaired))
    }

    const scripts = parsed?.scripts?.filter(Boolean)
    if (!scripts?.length) {
      return { scripts: fallbackScripts(count) }
    }

    return {
      scripts: scripts.slice(0, count).map((script) => ({
        ...script,
        durationSec: Math.max(30, Math.min(60, script.durationSec ?? 45)),
        bodyPoints: (script.bodyPoints ?? []).slice(0, 4),
      })),
      usage: parseUsage(payload),
    }
  } catch {
    return { scripts: fallbackScripts(count) }
  }
}

export const generateTwitterPosts = async (input: {
  brandBrief: string
  scripts: VideoScript[]
}) => {
  if (!input.scripts.length) {
    return { posts: [] as TwitterPost[] }
  }

  const prompt = buildTwitterPostsPrompt({
    brandBrief: input.brandBrief,
    scripts: input.scripts,
  })

  try {
    const payload = await callResponses(prompt)
    let parsed = parseJson<{ posts?: TwitterPost[] }>(extractResponseText(payload))

    if (!parsed) {
      const repaired = await callResponses(buildRepairPrompt(extractResponseText(payload)))
      parsed = parseJson<{ posts?: TwitterPost[] }>(extractResponseText(repaired))
    }

    const posts = parsed?.posts?.filter(Boolean)
    if (!posts?.length) {
      return { posts: fallbackTwitterPosts(input.scripts) }
    }

    return {
      posts: posts
        .slice(0, input.scripts.length)
        .map((post, index) => ({
          scriptIndex: post.scriptIndex || index + 1,
          text: (post.text ?? '').trim().slice(0, 280),
        }))
        .filter((post) => post.text.length > 0),
      usage: parseUsage(payload),
    }
  } catch {
    return { posts: fallbackTwitterPosts(input.scripts) }
  }
}
