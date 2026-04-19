require('dotenv').config();

const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateText } = require('ai');

/**
 * Creates an OpenAI-compatible provider and generates a "Hello World" sample response.
 *
 * @param {string} prompt - The prompt to send to the model (default: 'Say "Hello World"').
 * @returns {Promise<string>} - The generated text response.
 */
async function helloWorld(prompt = 'Say "Hello World Please"') {
  // Create an OpenAI-compatible provider instance.
  // Configure baseURL, name, and apiKey via environment variables.
  let baseURL = process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_API_KEY;
  const modelId = process.env.OPENAI_COMPATIBLE_MODEL || 'gpt-4o-mini';

  // The SDK expects the base URL without the /chat/completions path.
  // Strip common trailing paths if they were included in the env variable.
  if (baseURL.endsWith('/chat/completions')) {
    baseURL = baseURL.slice(0, -'/chat/completions'.length);
  }

  const provider = createOpenAICompatible({
    baseURL,
    name: process.env.OPENAI_COMPATIBLE_PROVIDER_NAME || 'openai-compatible',
    apiKey,
  });

  // Select a chat model.
  const model = provider.chatModel(modelId);

  // Generate text using the ai SDK.
  const { text } = await generateText({
    model,
    prompt,
  });

  return text;
}

// Run the sample if this file is executed directly.
if (require.main === module) {
  (async () => {
    try {
      const result = await helloWorld();
      console.log('Generated response:');
      console.log(result);
    } catch (error) {
      console.error('Error generating Hello World:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { helloWorld };
