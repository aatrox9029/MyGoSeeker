import { putBinaryJob, getBinaryJob, deleteBinaryJob } from "../files/binary-store.js";
import { throwIfAborted } from "../tasks/operation-control.js";
let creating;
export async function ensureOffscreenDocument() {
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL("offscreen.html")]
    });
    if (!contexts.length) await chrome.offscreen.createDocument({
      url: "offscreen.html", reasons: ["WORKERS"], justification: "Remux and validate downloaded media."
    });
  })();
  try { await creating; } finally { creating = null; }
}
export async function remuxHlsInOffscreen(job, { signal } = {}) {
  throwIfAborted(signal);
  await ensureOffscreenDocument();
  throwIfAborted(signal);
  const key = job.jobPrefix;
  await putBinaryJob(key, job);
  const cancel = () => chrome.runtime.sendMessage({ type: "OFFSCREEN_CANCEL_REMUX", target: "offscreen", jobKey: key }).catch(() => {});
  try {
    if (job.cardId) await putBinaryJob(`active-remux:${job.cardId}`, { jobKey: key, cardId: job.cardId });
    throwIfAborted(signal);
    // Send the job before registering cancellation, so a queued cancel always has a matching job.
    const pending = chrome.runtime.sendMessage({ type: "OFFSCREEN_REMUX_HLS", target: "offscreen", jobKey: key });
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const response = await pending;
    if (signal?.aborted) {
      const result = await getBinaryJob(`${key}:result`);
      if (result?.objectUrl) await chrome.runtime.sendMessage({ type: "OFFSCREEN_RELEASE_URL", objectUrl: result.objectUrl });
      throwIfAborted(signal);
    }
    if (!response?.ok) throw new Error(response?.error || "Offscreen remux failed");
    const result = await getBinaryJob(`${key}:result`);
    if (!result?.objectUrl) throw new Error("Remux returned empty media");
    return result;
  } finally {
    signal?.removeEventListener("abort", cancel);
    await Promise.all([deleteBinaryJob(key), deleteBinaryJob(`${key}:result`)]);
    if (job.cardId) await deleteBinaryJob(`active-remux:${job.cardId}`);
  }
}
