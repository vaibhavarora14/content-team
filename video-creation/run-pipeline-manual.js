require('dotenv').config();

const fs = require('fs-extra');
const path = require('path');
const { uploadLocalFile, uploadWithRetry } = require('./src/utils/kieFileUpload');
const { pollKieJob } = require('./src/utils/pollKieJob');
const { downloadAsset } = require('./src/utils/downloadAsset');
const { stitchReel } = require('./src/functions/stitch');

const IMAGES_DIR = path.resolve(process.cwd(), 'output', 'images');
const VIDEOS_DIR = path.resolve(process.cwd(), 'output', 'videos');

const KIE_BASE_URL = (process.env.KIE_AI_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const KIE_API_KEY = process.env.KIE_AI_API_KEY;

const MOTION_PROMPTS = [
  "A claymation gym-goer slowly raises a magnifying glass toward a shiny protein bar wrapper. The text on the wrapper subtly wiggles and morphs, then suddenly springs off the packaging, transforming into a gooey green multi-eyed clay monster that holds up a sign reading 'MALTITOL & SYRUPS'. Gentle camera push-in, cartoonish stretching motion.",
  "The green clay monster playfully pokes the gym-goer in the stomach. The gym-goer's belly slowly inflates and expands like a round clay balloon, arms lifting slightly as they look distressed. Subtle bounce and wobble on the inflated belly. Static camera with slight zoom.",
  "A giant clay hand swoops in from the left side of the frame and powerfully swats the monster away into the distance. Immediately after, a 'The Whole Truth' protein bar drops from above, rotating slightly as it falls, and lands with a heavy solid thud in the center of the frame. Dynamic camera follow on the hand swat, then static on the landing.",
  "The 'The Whole Truth' protein bar spins elegantly in the center of the frame. One by one, ingredients pop out in 3D clay around it — a plump date, a scoop of whey, a cashew, an almond, and a cocoa bean — each bouncing cheerfully. They do a quick synchronized victory dance, then smash together to form a fresh protein bar. Slow orbit camera around the bar.",
  "The bloated gym-goer takes a big bite of the TWT protein bar. Their inflated body rapidly deflates back to a normal, fit shape with a happy expression. They then proudly raise one arm and flex a big bicep. The camera slowly pulls back to reveal the TWT bar centered on a clean white background with the logo. Smooth dolly out."
];

async function uploadImages() {
  console.log('[Manual Step 1] Uploading existing images to Kie AI for stable URLs...');
  const imageUrls = [];
  for (let i = 1; i <= 5; i++) {
    const localPath = path.join(IMAGES_DIR, `frame-${i}.png`);
    console.log(`  Uploading frame-${i}.png...`);
    const result = await uploadWithRetry(
      () => uploadLocalFile(localPath, 'images/storyboards'),
      3
    );
    console.log(`  Stable URL: ${result.fileUrl}`);
    imageUrls.push(result.fileUrl);
  }
  return imageUrls;
}

async function generateVideos(imageUrls) {
  console.log('\n[Manual Step 2] Submitting video generation jobs...');
  const jobIds = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    const motionPrompt = MOTION_PROMPTS[i];
    console.log(`  Submitting video job ${i + 1}/5...`);

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
          return_last_frame: false,
          generate_audio: false,
          resolution: '480p',
          aspect_ratio: '16:9',
          duration: 5,
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
    console.log(`  Video job ${i + 1} submitted: ${jobId}`);
  }

  console.log('\n[Manual Step 2] Polling for video generation results...');
  const results = await Promise.all(
    jobIds.map((jobId, idx) =>
      pollKieJob(jobId).then((result) => {
        console.log(`  Video job ${idx + 1} complete.`);
        return result;
      })
    )
  );

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

  return videoUrls;
}

async function main() {
  console.log('========================================');
  console.log('   Manual Pipeline (Skip LLM prompts)   ');
  console.log('========================================\n');

  await fs.ensureDir(VIDEOS_DIR);

  const imageUrls = await uploadImages();
  const videoUrls = await generateVideos(imageUrls);

  console.log('\n[Manual Step 3] Stitching with ffmpeg...');
  const outputPath = path.resolve(process.cwd(), 'output', 'final-reel.mp4');
  const finalPath = await stitchReel(videoUrls, outputPath);

  console.log('\n========================================');
  console.log('   Pipeline Finished Successfully!    ');
  console.log(`   Final video: ${finalPath}`);
  console.log('========================================');
}

main().catch((err) => {
  console.error('\n❌ Pipeline failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
