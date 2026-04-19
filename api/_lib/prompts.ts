export const buildTopicsPrompt = (input: {
  brandBrief: string
  researchSnippets: string[]
}) => `
You are a strategist for short-form videos.
Output strict JSON only.

Schema:
{
  "topics": [
    {
      "title": "string",
      "angle": "string",
      "whyNow": "string",
      "sourceResultIds": ["string"],
      "confidence": 0.0
    }
  ]
}

Rules:
- Return 4 to 6 topics.
- confidence must be between 0 and 1.
- Topics should be useful for 30-60 second videos.

Brand brief:
${input.brandBrief}

Research snippets:
${input.researchSnippets.join('\n\n')}
`.trim()

export const buildScriptsPrompt = (input: {
  brandBrief: string
  topics: Array<{ title: string; angle: string; whyNow: string }>
  count: number
}) => `
You are a short-form script writer for Instagram Reels.
Write every script for a claymation-style video concept.
Output strict JSON only.

Schema:
{
  "scripts": [
    {
      "title": "string",
      "hook": "string",
      "bodyPoints": ["string", "string", "string"],
      "cta": "string",
      "voiceoverScript": "string",
      "durationSec": 30
    }
  ]
}

Rules:
- Return exactly ${input.count} scripts.
- bodyPoints length must be 3 or 4.
- durationSec must be exactly 30.
- Keep script angles distinct.
- Each script should feel native to Instagram Reels: punchy hook, fast pacing, and clear payoff.
- Use language that suits a claymation-style reel (playful, visual, tactile moments) without adding production instructions outside JSON schema.
- voiceoverScript must be narration-ready plain text for a natural 30-second voiceover (no stage directions, timestamps, or bullet points).

Brand brief:
${input.brandBrief}

Topics:
${input.topics.map((topic, index) => `${index + 1}. ${topic.title} | ${topic.angle} | ${topic.whyNow}`).join('\n')}
`.trim()

export const buildTwitterPostsPrompt = (input: {
  brandBrief: string
  scripts: Array<{
    title: string
    hook: string
    bodyPoints: string[]
    cta: string
  }>
}) => `
You are a social media writer for X (Twitter).
Output strict JSON only.

Schema:
{
  "posts": [
    {
      "scriptIndex": 1,
      "text": "string"
    }
  ]
}

Rules:
- Return exactly ${input.scripts.length} posts.
- scriptIndex starts from 1 and must map 1:1 with input scripts order.
- Each post should be concise and engaging.
- Keep each post under 280 characters.
- Do not use hashtags unless they are highly relevant.
- Do not include URLs.

Brand brief:
${input.brandBrief}

Scripts:
${input.scripts
  .map(
    (script, index) =>
      `${index + 1}. ${script.title}\nHook: ${script.hook}\nBody: ${script.bodyPoints.join(' | ')}\nCTA: ${script.cta}`
  )
  .join('\n\n')}
`.trim()

export const buildRepairPrompt = (raw: string) => `
Return only valid JSON.
Do not include markdown.
Fix this content:
${raw}
`.trim()
