// Reconcile persisted tasks once per worker startup; never silently restart a recording.
export async function recoverDownloads(cards, { downloads, tabs, isVideo, recoverRemux = async () => {} }) {
  let changed = false;
  for (const card of Object.values(cards)) {
    if (!["queued", "downloading", "paused"].includes(card.status)) continue;
    if (card.status === "queued") { card.status = "paused"; card.stage = "Queued task interrupted; resume"; changed = true; continue; }
    if (card.activeDownloadId) {
      let item;
      try { [item] = await downloads.search({ id: card.activeDownloadId }); }
      catch (error) {
        // A transient API failure must not prevent the entire extension from starting.
        card.error = `Unable to check browser download: ${error.message || error}`;
        card.stage = "Download status unavailable; retry Resume";
        card.status = "paused";
        changed = true;
        continue;
      }
      if (item?.state === "in_progress") {
        card.status = item.paused ? "paused" : "downloading";
        card.stage = item.paused ? "Download paused" : "Browser downloading";
        card.progress = item.totalBytes > 0 ? Math.min(99, item.bytesReceived / item.totalBytes * 100) : card.progress;
      } else if (item?.state === "complete" && isVideo(item, card)) {
        Object.assign(card, { status: "completed", progress: 100, stage: "Completed", error: "", completedAt: Date.now(), activeDownloadId: 0, activeObjectUrl: "" });
      } else {
        Object.assign(card, { status: "paused", stage: "Download interrupted; resume to retry", error: item?.error || "", activeDownloadId: item?.canResume ? item.id : 0, activeObjectUrl: "" });
      }
    } else if (card.nativeJobId) {
      Object.assign(card, { status: "paused", stage: "Native task needs reconnection; resume or cancel", error: "" });
    } else if (card.variants?.find((v) => v.id === card.selectedVariantId)?.isBlob) {
      let task;
      try { task = await tabs.sendMessage(card.tabId, { type: "QUERY_CONTENT_TASK", cardId: card.id }, { frameId: card.frameId || 0 }); } catch { /* Tab may have closed. */ }
      if (task?.active) {
        card.status = task.paused ? "paused" : "downloading";
      } else {
        Object.assign(card, { status: "error", stage: "Recording/source interrupted; replay and retry", error: "The original page task is no longer running.", nativeJobId: "" });
      }
    } else {
      await recoverRemux(card.id);
      Object.assign(card, { status: "paused", stage: "Download interrupted; resume saved segments", error: "", nativeJobId: "", activeObjectUrl: "" });
    }
    card.updatedAt = Date.now();
    changed = true;
  }
  return changed;
}
