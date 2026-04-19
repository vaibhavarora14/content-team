require('dotenv').config();

const KIE_BASE_URL = (process.env.KIE_AI_BASE_URL || 'https://api.kie.ai').replace(/\/$/, '');
const KIE_API_KEY = process.env.KIE_AI_API_KEY;

if (!KIE_API_KEY) {
  throw new Error('Missing KIE_AI_API_KEY in environment');
}

/**
 * Poll a Kie AI job until it completes or times out.
 * Docs: GET /api/v1/jobs/recordInfo?taskId={taskId}
 * States: waiting | queuing | generating | success | fail
 *
 * @param {string} jobId
 * @param {object} options
 * @param {number} options.intervalMs - Polling interval in ms (default: 5000)
 * @param {number} options.maxAttempts - Max poll attempts (default: 240 = 20 min)
 * @returns {Promise<object>} - Resolves with job output (contains resultJson, etc.)
 */
async function pollKieJob(jobId, { intervalMs = 5000, maxAttempts = 240 } = {}) {
  const url = `${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${jobId}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kie AI recordInfo failed (HTTP ${res.status}): ${text}`);
    }

    const data = await res.json();
    const task = data?.data;
    const state = task?.state;

    if (state === 'success') {
      // resultJson is a JSON string; parse it for convenience
      if (task.resultJson && typeof task.resultJson === 'string') {
        try {
          task.parsedResult = JSON.parse(task.resultJson);
        } catch {
          task.parsedResult = null;
        }
      }
      return task;
    }

    if (state === 'fail') {
      throw new Error(
        `Kie AI job ${jobId} failed: ${task.failCode} - ${task.failMsg}`
      );
    }

    // Job is still pending / processing
    console.log(`  [poll] Job ${jobId} state: ${state} (attempt ${attempt}/${maxAttempts})`);
    await sleep(intervalMs);
  }

  throw new Error(`Kie AI job ${jobId} timed out after ${maxAttempts} attempts.`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { pollKieJob };
