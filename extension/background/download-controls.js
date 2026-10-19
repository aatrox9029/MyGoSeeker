import { clearSegmentCheckpoint } from "../../core/hls/segment-checkpoint.js";
import { addDebugEntry, finalizeDebugLog } from "../../core/debug/media-debug-log.js";
import { buildDebugReport } from "../../core/debug/export-debug-report.js";
import { createRequestId } from "../native/protocol.js";
import { releaseRemuxUrl } from "../../core/files/save-remux.js";

export function createDownloadControls({ getCard, operations, setCardStatus, startDownload, getCardDebugLog, sendNativeCommand, activeDownloads }) {
  const controlling = new Set();
  return async function controlDownload(cardId, action) {
    if (!["pause", "resume", "cancel"].includes(action)) throw new Error("Unknown download action");
    const card = getCard(cardId);
    if (!card || !["queued", "downloading", "paused"].includes(card.status)) throw new Error("No active download");
    if (controlling.has(cardId)) throw new Error("Download control is already in progress");
    controlling.add(cardId);
    try {
      const variant = card.variants.find((item) => item.id === card.selectedVariantId);
      addDebugEntry(getCardDebugLog(card), "info", "control", "Download control requested", { action, stage: card.stage, downloadId: card.activeDownloadId });
      if (card.activeDownloadId) {
        const id = card.activeDownloadId;
        if (action === "cancel") {
          await chrome.downloads.cancel(id);
          activeDownloads.delete(id);
        } else if (action === "pause") await chrome.downloads.pause(id);
        else await chrome.downloads.resume(id);
      } else if (card.nativeJobId) {
        await sendNativeCommand({ type: `${action.toUpperCase()}_JOB`, requestId: createRequestId("control"), jobId: card.nativeJobId });
      } else if (variant?.isBlob) {
        const result = await chrome.tabs.sendMessage(card.tabId, { type: "CONTROL_CONTENT_TASK", cardId, action }, { frameId: card.frameId || 0 });
        if (!result?.ok) throw new Error(result?.error || "Original page task is unavailable");
      } else if (action === "resume") {
        if (card.status !== "paused") throw new Error("Download is not paused");
        await setCardStatus(cardId, { status: "available" });
        // Return immediately so the popup can show progress and issue another control.
        startDownload(cardId, card.selectedVariantId).catch(console.error);
        return;
      } else {
        await operations.stop(cardId, action);
        // A browser save can start while the previous asynchronous stage is settling.
        if (card.activeDownloadId) {
          if (action === "cancel") { await chrome.downloads.cancel(card.activeDownloadId); activeDownloads.delete(card.activeDownloadId); }
          else await chrome.downloads.pause(card.activeDownloadId);
        }
      }
      if (action === "cancel") {
        await releaseRemuxUrl(card.activeObjectUrl);
        if (variant?.isM3u8 || variant?.type === "mpd") await clearSegmentCheckpoint(cardId);
        await setCardStatus(cardId, { status: "available", progress: 0, stage: "Download cancelled", activeDownloadId: 0, nativeJobId: "", activeObjectUrl: "", error: "" });
      } else {
        if (card.status === "completed") return;
        await setCardStatus(cardId, { status: action === "pause" ? "paused" : "downloading", stage: action === "pause" ? "Download paused" : "Download resumed", error: "" });
      }
      const log = getCardDebugLog(card);
      if (log) await setCardStatus(cardId, { debugReport: buildDebugReport({ card, log: finalizeDebugLog(log, action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "running") }) });
    } finally { controlling.delete(cardId); }
  };
}
