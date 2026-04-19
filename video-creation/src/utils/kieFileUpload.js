const fs = require('fs-extra');
const path = require('path');

const KIE_UPLOAD_BASE_URL = 'https://kieai.redpandaai.co';
const KIE_API_KEY = process.env.KIE_AI_API_KEY;

if (!KIE_API_KEY) {
  throw new Error('Missing KIE_AI_API_KEY in environment');
}

/**
 * Upload a local file to Kie AI's file server using binary stream upload.
 * Best for: large files, local files (recommended for files > 1MB).
 *
 * @param {string} filePath - Absolute path to local file
 * @param {string} uploadPath - Directory path on server (e.g. 'videos' or 'images/reels')
 * @param {string} [fileName] - Desired filename on server (defaults to original basename)
 * @returns {Promise<{fileUrl: string, downloadUrl: string, fileId: string, expiresAt: string}>}
 */
async function uploadLocalFile(filePath, uploadPath = '', fileName) {
  const finalFileName = fileName || path.basename(filePath);
  const form = new FormData();
  const fileBuffer = await fs.readFile(filePath);
  const blob = new Blob([fileBuffer]);
  form.append('file', blob, finalFileName);
  if (uploadPath) form.append('uploadPath', uploadPath);
  form.append('fileName', finalFileName);

  const res = await fetch(`${KIE_UPLOAD_BASE_URL}/api/file-stream-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
    },
    body: form,
  });

  return parseUploadResponse(res, filePath);
}

/**
 * Upload a file from a remote URL to Kie AI's file server.
 * Kie AI will automatically download the file from the provided URL.
 * Best for: file migration, batch processing, remote resources.
 *
 * @param {string} fileUrl - Publicly accessible remote URL
 * @param {string} uploadPath - Directory path on server
 * @param {string} [fileName] - Desired filename on server
 * @returns {Promise<{fileUrl: string, downloadUrl: string, fileId: string, expiresAt: string}>}
 */
async function uploadFromUrl(fileUrl, uploadPath = '', fileName) {
  const res = await fetch(`${KIE_UPLOAD_BASE_URL}/api/file-url-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileUrl,
      uploadPath,
      fileName,
    }),
  });

  return parseUploadResponse(res, fileUrl);
}

/**
 * Upload a Base64-encoded file to Kie AI's file server.
 * Best for: small files (<= 10MB), API integrations, Data URLs.
 *
 * @param {string} base64Data - Base64 string (optionally with data URI prefix like "data:image/png;base64,...")
 * @param {string} uploadPath - Directory path on server
 * @param {string} fileName - Desired filename on server
 * @returns {Promise<{fileUrl: string, downloadUrl: string, fileId: string, expiresAt: string}>}
 */
async function uploadBase64(base64Data, uploadPath = '', fileName) {
  if (!fileName) {
    throw new Error('fileName is required for Base64 uploads');
  }

  const res = await fetch(`${KIE_UPLOAD_BASE_URL}/api/file-base64-upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      base64Data,
      uploadPath,
      fileName,
    }),
  });

  return parseUploadResponse(res, 'base64-data');
}

/**
 * Shared response parser with retries for 500 errors.
 */
async function parseUploadResponse(res, source) {
  if (!res.ok) {
    const text = await res.text().catch(() => 'No response body');
    throw new Error(`Kie AI file upload failed (HTTP ${res.status}): ${text}`);
  }

  const data = await res.json();
  const payload = data?.data || data;

  const fileUrl = payload?.fileUrl || payload?.downloadUrl;
  if (!fileUrl) {
    throw new Error(
      `No fileUrl in upload response for "${source}": ${JSON.stringify(data)}`
    );
  }

  console.log(`  Uploaded to: ${fileUrl}`);
  if (payload?.expiresAt) {
    console.log(`  Expires at:  ${payload.expiresAt}`);
  }

  return {
    fileUrl,
    downloadUrl: payload?.downloadUrl,
    fileId: payload?.fileId,
    expiresAt: payload?.expiresAt,
    fileName: payload?.fileName,
    fileSize: payload?.fileSize,
    mimeType: payload?.mimeType,
  };
}

/**
 * Upload with automatic retry and exponential backoff.
 *
 * @param {Function} uploadFn - An upload function to retry
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 */
async function uploadWithRetry(uploadFn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadFn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = Math.pow(2, i) * 1000;
      console.log(`  Upload failed, retrying in ${delay}ms... (${error.message})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

module.exports = {
  uploadLocalFile,
  uploadFromUrl,
  uploadBase64,
  uploadWithRetry,
};
