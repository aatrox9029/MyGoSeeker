import { getBinaryJob, deleteBinaryJob } from "../files/binary-store.js";

export async function recoverRemux(cardId) {
  const marker = `active-remux:${cardId}`;
  const job = await getBinaryJob(marker);
  if (!job) return;
  // Cancellation acknowledges only after the queued/active job has settled.
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  if (contexts.length) {
    await chrome.runtime.sendMessage({ type: "OFFSCREEN_CANCEL_REMUX", target: "offscreen", jobKey: job.jobKey });
    const result = await getBinaryJob(`${job.jobKey}:result`);
    if (result?.objectUrl) await chrome.runtime.sendMessage({ type: "OFFSCREEN_RELEASE_URL", objectUrl: result.objectUrl });
  }
  await Promise.all([deleteBinaryJob(job.jobKey), deleteBinaryJob(`${job.jobKey}:result`), deleteBinaryJob(marker)]);
}
