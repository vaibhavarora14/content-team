const fs = require('fs-extra');
const path = require('path');

/**
 * Download a remote asset to a local file.
 * @param {string} url - Remote URL
 * @param {string} destPath - Local destination path
 */
async function downloadAsset(url, destPath) {
  await fs.ensureDir(path.dirname(destPath));
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download asset (${res.status}): ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buffer);
  console.log(`  Saved: ${destPath}`);
  return destPath;
}

module.exports = { downloadAsset };
