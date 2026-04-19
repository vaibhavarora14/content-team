const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const path = require('path');
const { getStateKey } = require('../utils/saveState');
const { downloadAsset } = require('../utils/downloadAsset');

const OUTPUT_DIR = path.resolve(process.cwd(), 'output');
const VIDEOS_DIR = path.resolve(OUTPUT_DIR, 'videos');
const TEMP_DIR = path.resolve(OUTPUT_DIR, 'temp-stitch');

/**
 * Normalize a single clip to a consistent format (H.264, AAC, 1080x1920, 30fps).
 * Adds silent audio if the source has no audio track.
 *
 * @param {string} inputPath
 * @param {string} outputPath
 */
async function normalizeClip(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioFrequency(48000)
      .audioChannels(2)
      .size('1080x1920')
      .fps(30)
      .autopad('black')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-movflags +faststart',
        '-shortest',
      ])
      .on('end', () => resolve())
      .on('error', (err) => {
        reject(new Error(`Failed to normalize ${path.basename(inputPath)}: ${err.message}`));
      })
      .save(outputPath);
  });
}

/**
 * Function 3: Stitching with ffmpeg
 * - Downloads 5 video clips locally.
 * - Normalizes each clip to the same codec/resolution/fps.
 * - Concatenates them into a single 9:16 MP4 using ffmpeg.
 *
 * @param {string[]} videoUrls - Array of 5 video clip URLs.
 * @param {string} outputPath - Final output file path.
 * @returns {Promise<string>} - Absolute path to the rendered video.
 */
async function stitchReel(videoUrls, outputPath = path.join(OUTPUT_DIR, 'final-reel.mp4')) {
  if (!Array.isArray(videoUrls) || videoUrls.length < 5) {
    throw new Error(`Expected 5 video URLs, got ${videoUrls?.length}`);
  }

  console.log('[Function 3] Preparing output directories...');
  await fs.ensureDir(OUTPUT_DIR);
  await fs.ensureDir(VIDEOS_DIR);
  await fs.ensureDir(TEMP_DIR);

  // Use locally saved clips if available, otherwise download
  console.log('[Function 3] Preparing video clips...');
  const cachedPaths = await getStateKey('videoClipPaths');
  const localClipPaths = [];
  for (let i = 0; i < videoUrls.length; i++) {
    let clipPath = cachedPaths?.[i];
    if (!clipPath || !(await fs.pathExists(clipPath))) {
      clipPath = path.join(VIDEOS_DIR, `clip-${i + 1}.mp4`);
      await downloadAsset(videoUrls[i], clipPath);
    }
    localClipPaths.push(clipPath);
  }

  // Normalize each clip to ensure consistent codec, resolution, fps, and audio
  console.log('[Function 3] Normalizing clips for concatenation...');
  const normalizedPaths = [];
  for (let i = 0; i < localClipPaths.length; i++) {
    const normalizedPath = path.join(TEMP_DIR, `normalized-${i + 1}.mp4`);
    await normalizeClip(localClipPaths[i], normalizedPath);
    normalizedPaths.push(normalizedPath);
    console.log(`  Clip ${i + 1} normalized.`);
  }

  // Create concat demuxer list file
  const concatListPath = path.join(TEMP_DIR, 'concat-list.txt');
  const concatList = normalizedPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n');
  await fs.writeFile(concatListPath, concatList);

  // Concatenate with ffmpeg using copy mode (fast, no re-encode)
  console.log('[Function 3] Stitching clips with ffmpeg...');
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy', '-movflags +faststart'])
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`  Stitch progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('[Function 3] Stitching complete.');
        resolve();
      })
      .on('error', (err) => {
        reject(new Error(`ffmpeg stitching failed: ${err.message}`));
      })
      .save(outputPath);
  });

  // Cleanup temp files
  console.log('[Function 3] Cleaning up temporary files...');
  await fs.remove(TEMP_DIR);

  console.log(`[Function 3] Final Reel saved to: ${outputPath}`);
  return outputPath;
}

module.exports = { stitchReel };
