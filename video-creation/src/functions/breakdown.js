require('dotenv').config();

const path = require('path');
const { generateVisualPrompts } = require('../utils/generatePrompts');
const { pollKieJob } = require('../utils/pollKieJob');
const { getStateKey, setStateKey } = require('../utils/saveState');
const { downloadAsset } = require('../utils/downloadAsset');
const { uploadLocalFile, uploadWithRetry } = require('../utils/kieFileUpload');

const IMAGES_DIR = path.resolve(process.cwd(), 'output', 'images');

const KIE_BASE_URL = (process.env.KIE_AI_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const KIE_API_KEY = process.env.KIE_AI_API_KEY;

if (!KIE_API_KEY) {
  throw new Error('Missing KIE_AI_API_KEY in environment');
}

/**
 * Function 1: Script Breakdown & Storyboard Image Generation
 * - Breaks the script into 5 visual prompts via LLM.
 * - Calls Kie AI bytedance/seedream to generate 5 vertical images.
 * - Polls for results and returns the image URLs.
 *
 * @param {string} script - The 30-second Instagram Reel script.
 * @param {boolean} skipIfCached - If true and state has URLs, return cached.
 * @returns {Promise<string[]>} - Array of 5 image URLs.
 */
async function generateStoryboardImages(script, skipIfCached = true) {
  // Check cache
  if (skipIfCached) {
    const cached = await getStateKey('storyboardImages');
    if (cached && Array.isArray(cached) && cached.length === 5) {
      console.log('[Function 1] Using cached storyboard images.');
      return cached;
    }
  }

  console.log('[Function 1] Generating visual prompts from script...');
  const visualPrompts = await generateVisualPrompts(script);
  console.log(`[Function 1] Got ${visualPrompts.length} visual prompts.`);

  const imageUrls = [];
  const imagePaths = [];
  let previousImageUrl = null;

  for (let i = 0; i < visualPrompts.length; i++) {
    const prompt = visualPrompts[i];
    console.log(`[Function 1] Submitting image job ${i + 1}/5 (${i === 0 ? 'text-to-image' : 'image-to-image'})...`);

    const body =
      i === 0
        ? {
            model: 'qwen/text-to-image',
            callBackUrl: '', // unused, we poll instead
            input: {
              prompt,
              image_size: 'portrait_16_9',
              num_inference_steps: 30,
              guidance_scale: 2.5,
              enable_safety_checker: true,
              output_format: 'png',
              negative_prompt: ' ',
              acceleration: 'none',
            },
          }
        : {
            model: 'qwen/image-to-image',
            callBackUrl: '',
            input: {
              prompt,
              image_url: previousImageUrl,
              image_size: 'portrait_16_9',
              strength: 0.8,
              output_format: 'png',
              acceleration: 'none',
              negative_prompt: 'blurry, ugly',
              num_inference_steps: 30,
              guidance_scale: 2.5,
              enable_safety_checker: true,
            },
          };

    const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Image job submission failed (HTTP ${res.status}): ${text}`);
    }

    const data = await res.json();
    const jobId = data?.data?.taskId || data?.data?.id || data?.taskId || data?.id;
    if (!jobId) {
      throw new Error(`No job ID returned for image job ${i + 1}: ${JSON.stringify(data)}`);
    }
    console.log(`[Function 1] Image job ${i + 1} submitted: ${jobId}`);

    // Poll for result
    const result = await pollKieJob(jobId);
    console.log(`[Function 1] Image job ${i + 1} complete.`);

    const url =
      result?.parsedResult?.resultUrls?.[0] ||
      result?.parsedResult?.url ||
      result?.output?.image_url ||
      result?.output?.url ||
      result?.url;
    if (!url) {
      console.error(`Full result for job ${i + 1}:`, JSON.stringify(result, null, 2));
      throw new Error(`No image URL in result for job ${i + 1}`);
    }

    const localPath = path.join(IMAGES_DIR, `frame-${i + 1}.png`);
    await downloadAsset(url, localPath);
    imagePaths.push(localPath);

    // Upload to Kie AI file server for a stable URL (needed for next image-to-image and video generation)
    console.log(`[Function 1] Uploading frame ${i + 1} to Kie AI for stable URL...`);
    let stableUrl = url;
    try {
      const uploadResult = await uploadWithRetry(
        () => uploadLocalFile(localPath, 'images/storyboards'),
        3
      );
      stableUrl = uploadResult.fileUrl;
      console.log(`[Function 1] Stable URL for frame ${i + 1}: ${stableUrl}`);
    } catch (uploadErr) {
      console.warn(
        `[Function 1] Upload failed for frame ${i + 1}, falling back to generation URL: ${uploadErr.message}`
      );
    }

    imageUrls.push(stableUrl);
    previousImageUrl = stableUrl;
  }

  await setStateKey('storyboardImages', imageUrls);
  await setStateKey('storyboardImagePaths', imagePaths);
  console.log('[Function 1] Storyboard images saved to state and disk.');
  return imageUrls;
}

module.exports = { generateStoryboardImages };
