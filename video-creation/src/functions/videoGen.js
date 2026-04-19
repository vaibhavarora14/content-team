require('dotenv').config();

const path = require('path');
const { generateMotionPrompts } = require('../utils/generatePrompts');
const { pollKieJob } = require('../utils/pollKieJob');
const { getStateKey, setStateKey } = require('../utils/saveState');
const { downloadAsset } = require('../utils/downloadAsset');

const VIDEOS_DIR = path.resolve(process.cwd(), 'output', 'videos');

const KIE_BASE_URL = (process.env.KIE_AI_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const KIE_API_KEY = process.env.KIE_AI_API_KEY;

if (!KIE_API_KEY) {
  throw new Error('Missing KIE_AI_API_KEY in environment');
}

/**
 * Function 2: Video Prompting & Generation
 * - Generates 5 motion prompts based on the storyboard images.
 * - Calls Kie AI kling-2.6/image-to-video for each image.
 * - Polls for results and returns the video URLs.
 *
 * @param {string[]} imageUrls - Array of 5 storyboard image URLs.
 * @param {boolean} skipIfCached - If true and state has URLs, return cached.
 * @returns {Promise<string[]>} - Array of 5 video clip URLs.
 */
async function generateVideoClips(imageUrls, skipIfCached = true) {
  if (!Array.isArray(imageUrls) || imageUrls.length < 5) {
    throw new Error(`Expected 5 image URLs, got ${imageUrls?.length}`);
  }

  // Check cache
  if (skipIfCached) {
    const cached = await getStateKey('videoClips');
    if (cached && Array.isArray(cached) && cached.length === 5) {
      console.log('[Function 2] Using cached video clips.');
      return cached;
    }
  }

  console.log('[Function 2] Generating motion prompts from storyboard images...');
  const motionPrompts = await generateMotionPrompts(imageUrls);
  console.log(`[Function 2] Got ${motionPrompts.length} motion prompts.`);

  const jobIds = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    const motionPrompt = motionPrompts[i];
    console.log(`[Function 2] Submitting video job ${i + 1}/5...`);

    const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'bytedance/seedance-2-fast',
        callBackUrl: '',
        input: {
          prompt: motionPrompt,
          first_frame_url: imageUrl,
          last_frame_url: imageUrl,
          return_last_frame: false,
          generate_audio: false,
          resolution: '480p',
          aspect_ratio: '9:16',
          duration: 5, // seconds
          web_search: false,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Video job submission failed (HTTP ${res.status}): ${text}`);
    }

    const data = await res.json();
    const jobId = data?.data?.taskId || data?.data?.id || data?.taskId || data?.id;
    if (!jobId) {
      throw new Error(`No job ID returned for video job ${i + 1}: ${JSON.stringify(data)}`);
    }
    jobIds.push(jobId);
    console.log(`[Function 2] Video job ${i + 1} submitted: ${jobId}`);
  }

  // Poll all jobs in parallel
  console.log('[Function 2] Polling for video generation results...');
  const results = await Promise.all(
    jobIds.map((jobId, idx) =>
      pollKieJob(jobId).then((result) => {
        console.log(`[Function 2] Video job ${idx + 1} complete.`);
        return result;
      })
    )
  );

  // Extract URLs and download videos locally
  const videoUrls = [];
  const videoPaths = [];
  for (let idx = 0; idx < results.length; idx++) {
    const r = results[idx];
    const url =
      r?.parsedResult?.resultUrls?.[0] ||
      r?.parsedResult?.url ||
      r?.output?.video_url ||
      r?.output?.url ||
      r?.url;
    if (!url) {
      console.error(`Full result for job ${idx + 1}:`, JSON.stringify(r, null, 2));
      throw new Error(`No video URL in result for job ${idx + 1}`);
    }
    videoUrls.push(url);

    const localPath = path.join(VIDEOS_DIR, `clip-${idx + 1}.mp4`);
    await downloadAsset(url, localPath);
    videoPaths.push(localPath);
  }

  await setStateKey('videoClips', videoUrls);
  await setStateKey('videoClipPaths', videoPaths);
  console.log('[Function 2] Video clips saved to state and disk.');
  return videoUrls;
}

module.exports = { generateVideoClips };
