require('dotenv').config();

const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateText } = require('ai');

// Reuse the existing provider setup from index.js
let baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://api.openai.com/v1';
if (baseURL.endsWith('/chat/completions')) {
  baseURL = baseURL.slice(0, -'/chat/completions'.length);
}

const provider = createOpenAICompatible({
  baseURL,
  name: process.env.OPENAI_COMPATIBLE_PROVIDER_NAME || 'openai-compatible',
  apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_API_KEY,
});

const model = provider.chatModel(process.env.OPENAI_COMPATIBLE_MODEL || 'gpt-4o-mini');

/**
 * Generate 5 detailed visual prompts for storyboard images.
 * @param {string} script - The 30-second Instagram Reel script.
 * @returns {Promise<string[]>} - Array of 5 image generation prompts.
 */
async function generateVisualPrompts(script) {
  const systemPrompt = `You are a creative director for Instagram Reels. 
Your task is to break down a 30-second video script into exactly 5 visual storyboard frames.
Each prompt must:
- Describe a single, vivid scene.
- Specify vertical 9:16 orientation and cinematic Instagram Reel style.
- Be optimized for an AI image generator (bytedance/seedream).
- Output ONLY a raw JSON array of 5 strings. No markdown, no explanation.`;

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `Script:\n"""\n${script}\n"""\n\nGenerate the 5 visual prompts as a JSON array.`,
  });

  return parseJsonArray(text);
}

/**
 * Generate 5 motion/animation prompts corresponding to storyboard images.
 * @param {string[]} imageDescriptions - The 5 visual prompts (or short descriptions).
 * @returns {Promise<string[]>} - Array of 5 motion prompts.
 */
async function generateMotionPrompts(imageDescriptions) {
  const systemPrompt = `You are a video motion director for Instagram Reels.
Your task is to write exactly 5 short motion prompts for an AI image-to-video model (bytedance/seedance).
Each prompt must:
- Describe subtle, natural camera movement or subject animation.
- Be 1-2 sentences max.
- Match the corresponding storyboard frame.
- Output ONLY a raw JSON array of 5 strings. No markdown, no explanation.`;

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `Storyboard frames:\n${imageDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\nGenerate the 5 motion prompts as a JSON array.`,
  });

  return parseJsonArray(text);
}

function parseJsonArray(text) {
  // Try to extract JSON array from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // Find the first '[' and try to parse balanced array
  const firstBracket = text.indexOf('[');
  if (firstBracket !== -1) {
    // Find matching closing bracket
    let depth = 0;
    let lastBracket = -1;
    for (let i = firstBracket; i < text.length; i++) {
      if (text[i] === '[') depth++;
      if (text[i] === ']') depth--;
      if (depth === 0) {
        lastBracket = i;
        break;
      }
    }
    if (lastBracket !== -1) {
      const candidate = text.slice(firstBracket, lastBracket + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* fall through */ }
    }
  }

  // Last resort: try parsing the whole trimmed text
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }

  console.error('Failed to parse LLM response as JSON array:', text);
  throw new Error('Invalid JSON array from LLM');
}

module.exports = {
  generateVisualPrompts,
  generateMotionPrompts,
};
