require('dotenv').config();

const fs = require('fs-extra');
const path = require('path');
const { generateStoryboardImages } = require('./functions/breakdown');
const { generateVideoClips } = require('./functions/videoGen');
const { stitchReel } = require('./functions/stitch');
const { uploadLocalFile, uploadWithRetry } = require('./utils/kieFileUpload');
const { setStateKey } = require('./utils/saveState');

/**
 * Main orchestrator: runs the full Instagram Reel pipeline.
 *
 * Steps:
 *   1. Break script into 5 visual prompts → generate storyboard images.
 *   2. Generate motion prompts → create 5 video clips (image-to-video).
 *   3. Stitch clips with ffmpeg into a final 9:16 Reel.
 *
 * @param {string} script - The 30-second Instagram Reel script.
 * @param {string} outputPath - Where to save the final MP4.
 * @returns {Promise<string>} - Absolute path to the final video.
 */
async function runReelPipeline(script, outputPath = path.resolve(process.cwd(), 'output', 'final-reel.mp4')) {
  if (!script || typeof script !== 'string') {
    throw new Error('A valid script string is required.');
  }

  console.log('========================================');
  console.log('   Instagram Reel Pipeline Starting   ');
  console.log('========================================\n');

  // Step 1: Storyboard Images
  const imageUrls = await generateStoryboardImages(script);
  console.log('\n✅ Step 1 complete — Storyboard images generated.\n');

  // Step 2: Video Clips
  const videoUrls = await generateVideoClips(imageUrls);
  console.log('\n✅ Step 2 complete — Video clips generated.\n');

  // Step 3: Stitch with ffmpeg
  await fs.ensureDir(path.dirname(outputPath));
  const finalPath = await stitchReel(videoUrls, outputPath);
  console.log('\n✅ Step 3 complete — Final Reel rendered.\n');

  // Step 4: Upload final reel to Kie AI for easy sharing
  console.log('[Step 4] Uploading final reel to Kie AI...');
  let uploadedReel = null;
  try {
    uploadedReel = await uploadWithRetry(
      () => uploadLocalFile(finalPath, 'videos/reels', path.basename(outputPath)),
      3
    );
    await setStateKey('finalReelUrl', uploadedReel.fileUrl);
    console.log('\n✅ Step 4 complete — Final reel uploaded.\n');
  } catch (uploadErr) {
    console.warn('\n⚠️  Step 4 failed — Could not upload final reel:', uploadErr.message);
  }

  console.log('========================================');
  console.log('   Pipeline Finished Successfully!    ');
  console.log(`   Local:   ${finalPath}`);
  if (uploadedReel?.fileUrl) {
    console.log(`   Public:  ${uploadedReel.fileUrl}`);
    console.log(`   Download: ${uploadedReel.downloadUrl}`);
    if (uploadedReel.expiresAt) {
      console.log(`   Expires: ${uploadedReel.expiresAt}`);
    }
  }
  console.log('========================================');

  return uploadedReel?.fileUrl || finalPath;
}

// Allow direct execution: node src/pipeline.js "Your script here..."
if (require.main === module) {
  const script = process.argv[2];
  if (!script) {
    console.error('Usage: node src/pipeline.js "Your 30-second Instagram Reel script..."');
    process.exit(1);
  }

  runReelPipeline(script).catch((err) => {
    console.error('\n❌ Pipeline failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { runReelPipeline };
