require('dotenv').config();

const path = require('path');
const fs = require('fs-extra');
const { pollKieJob } = require('../utils/pollKieJob');
const { downloadAsset } = require('../utils/downloadAsset');
const { getStateKey, setStateKey } = require('../utils/saveState');

const OUTPUT_DIR = path.resolve(process.cwd(), 'output');
const AUDIO_DIR = path.resolve(OUTPUT_DIR, 'audio');

const KIE_BASE_URL = (process.env.KIE_AI_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const KIE_API_KEY = process.env.KIE_AI_API_KEY;
const VOICEOVER_MODEL = process.env.KIE_VOICEOVER_MODEL || 'elevenlabs/text-to-speech';
const VOICEOVER_VOICE_ID = process.env.KIE_VOICEOVER_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

if (!KIE_API_KEY) {
  throw new Error('Missing KIE_AI_API_KEY in environment');
}

const extractVoiceoverUrl = (result) => {
  return (
    result?.parsedResult?.resultUrls?.[0] ||
    result?.parsedResult?.audio_url ||
    result?.parsedResult?.url ||
    result?.output?.audio_url ||
    result?.output?.url ||
    result?.audio_url ||
    result?.url
  );
};

async function generateVoiceoverAudio(voiceoverScript, skipIfCached = true) {
  if (!voiceoverScript || typeof voiceoverScript !== 'string') {
    throw new Error('voiceoverScript is required to generate voiceover audio.');
  }

  if (skipIfCached) {
    const cached = await getStateKey('voiceoverAudioUrl');
    if (cached && typeof cached === 'string') {
      console.log('[Voiceover] Using cached voiceover audio URL.');
      return cached;
    }
  }

  await fs.ensureDir(AUDIO_DIR);

  console.log('[Voiceover] Submitting text-to-speech job...');
  const response = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VOICEOVER_MODEL,
      callBackUrl: '',
      input: {
        text: voiceoverScript.trim(),
        voice_id: VOICEOVER_VOICE_ID,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voiceover job submission failed (HTTP ${response.status}): ${text}`);
  }

  const payload = await response.json();
  const jobId = payload?.data?.taskId || payload?.data?.id || payload?.taskId || payload?.id;
  if (!jobId) {
    throw new Error(`No voiceover job ID returned: ${JSON.stringify(payload)}`);
  }

  console.log(`[Voiceover] Job submitted: ${jobId}`);
  const result = await pollKieJob(jobId);
  const voiceoverUrl = extractVoiceoverUrl(result);
  if (!voiceoverUrl) {
    throw new Error(`No voiceover URL returned from job ${jobId}.`);
  }

  const localPath = path.join(AUDIO_DIR, 'voiceover.mp3');
  await downloadAsset(voiceoverUrl, localPath);
  await setStateKey('voiceoverAudioUrl', voiceoverUrl);
  await setStateKey('voiceoverAudioPath', localPath);
  console.log('[Voiceover] Voiceover audio generated and saved locally.');

  return voiceoverUrl;
}

module.exports = { generateVoiceoverAudio };
