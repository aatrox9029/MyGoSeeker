import { putBinaryJob, getBinaryJob, deleteBinaryJob } from "../files/binary-store.js";
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
export async function remuxHlsInOffscreen(job) {
  await ensureOffscreenDocument();
  const key = job.jobPrefix;
  await putBinaryJob(key, job);
  try {
    const response = await chrome.runtime.sendMessage({ type: "OFFSCREEN_REMUX_HLS", target: "offscreen", jobKey: key });
    if (!response?.ok) throw new Error(response?.error || "Offscreen remux failed");
    const result = await getBinaryJob(`${key}:result`);
    if (!result?.objectUrl) throw new Error("Remux returned empty media");
    return result;
  } finally { await Promise.all([deleteBinaryJob(key), deleteBinaryJob(`${key}:result`)]); }
}
