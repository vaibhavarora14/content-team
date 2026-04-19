import type { DerivedQuery } from './types.js'

const STOP_WORDS = new Set([
  'a',
  'about',
  'and',
  'after',
  'also',
  'an',
  'are',
  'as',
  'at',
  'because',
  'brief',
  'brand',
  'business',
  'by',
  'company',
  'core',
  'demographic',
  'founded',
  'from',
  'goal',
  'has',
  'have',
  'in',
  'is',
  'into',
  'just',
  'like',
  'make',
  'mission',
  'more',
  'only',
  'persona',
  'positioning',
  'promise',
  'psychographic',
  'should',
  'that',
  'their',
  'there',
  'these',
  'this',
  'through',
  'to',
  'use',
  'using',
  'want',
  'with',
  'would',
])

const SUBJECT_HINTS = new Set([
  'protein',
  'bar',
  'bars',
  'snack',
  'snacks',
  'health',
  'nutrition',
  'ingredient',
  'ingredients',
  'sugar',
  'sweetener',
  'digestion',
  'label',
  'food',
  'benefit',
  'benefits',
  'myth',
  'myths',
  'facts',
  'mistakes',
  'comparison',
  'trend',
  'trends',
])

const normalizeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const extractLikelyBrandTokens = (brief: string) => {
  const firstSentence = brief.split(/[.!?]/)[0] ?? brief
  return new Set(
    (firstSentence.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? [])
      .map(normalizeToken)
      .filter((token) => token.length > 2)
  )
}

const scoreTerms = (brief: string) => {
  const brandTokens = extractLikelyBrandTokens(brief)
  const tokens = brief.match(/[A-Za-z0-9]+/g) ?? []
  const scores = new Map<string, number>()

  tokens.forEach((rawToken, index) => {
    const token = normalizeToken(rawToken)
    if (!token || token.length < 3 || STOP_WORDS.has(token)) {
      return
    }

    const isBrandToken = brandTokens.has(token)
    const isSubjectHint = SUBJECT_HINTS.has(token)
    const earlyPositionPenalty = index < 8 && isBrandToken ? 2 : 0
    const base = isSubjectHint ? 3 : 1
    const scoreDelta = base - earlyPositionPenalty
    const current = scores.get(token) ?? 0
    scores.set(token, current + scoreDelta)
  })

  return [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
}

export const deriveQueriesFromBrief = (brandBrief: string): DerivedQuery[] => {
  const terms = scoreTerms(brandBrief)
  const subjectStem = terms.slice(0, 3).join(' ') || 'consumer problem'

  return [
    { query: `${subjectStem} latest trends`, intent: 'trend' },
    { query: `${subjectStem} evidence based benefits`, intent: 'educational' },
    { query: `${subjectStem} common mistakes`, intent: 'problem' },
    { query: `${subjectStem} pros and cons`, intent: 'comparison' },
    { query: `${subjectStem} myths vs facts`, intent: 'comparison' },
  ]
}
