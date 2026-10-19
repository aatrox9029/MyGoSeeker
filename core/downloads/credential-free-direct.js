import { ensureOffscreenDocument } from "../remux/offscreen-client.js";
import { fetchWithRetry } from "../network/fetch-retry.js";
import { putBinaryJob, deleteBinaryJob } from "../files/binary-store.js";
import { saveRemuxDownload, releaseRemuxUrl } from "../files/save-remux.js";
import { throwIfAborted } from "../tasks/operation-control.js";
export async function downloadWithoutCredentials(url, filename, cardId, signal) {
  const key = `direct:${cardId}:${Date.now()}`;
  let objectUrl;
  try {
    const bytes = await fetchWithRetry(url, "arrayBuffer", { credentials: "omit", maxBytes: 16 * 1024 * 1024, signal });
    await ensureOffscreenDocument();
    await putBinaryJob(key, { bytes, cardId });
    throwIfAborted(signal);
    const response = await chrome.runtime.sendMessage({ target: "offscreen", type: "OFFSCREEN_VALIDATE_DIRECT", jobKey: key });
    if (!response?.ok) throw new Error(response?.error || "Direct media validation failed");
    objectUrl = response.data.objectUrl;
    throwIfAborted(signal);
    const downloadId = await saveRemuxDownload(chrome.downloads, response.data, filename);
    return { downloadId, ...response.data };
  } catch (error) { if (objectUrl) await releaseRemuxUrl(objectUrl); throw error; }
  finally { await deleteBinaryJob(key); }
}
