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
You are a short-form script writer.
Output strict JSON only.

Schema:
{
  "scripts": [
    {
      "title": "string",
      "hook": "string",
      "bodyPoints": ["string", "string", "string"],
      "cta": "string",
      "durationSec": 30
    }
  ]
}

Rules:
- Return exactly ${input.count} scripts.
- bodyPoints length must be 3 or 4.
- durationSec must be between 30 and 60.
- Keep script angles distinct.

Brand brief:
${input.brandBrief}

Topics:
${input.topics.map((topic, index) => `${index + 1}. ${topic.title} | ${topic.angle} | ${topic.whyNow}`).join('\n')}
`.trim()

export const buildRepairPrompt = (raw: string) => `
Return only valid JSON.
Do not include markdown.
Fix this content:
${raw}
`.trim()
