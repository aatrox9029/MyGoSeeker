export function createDownloadEventHandler({ getState, ensureInitialized, activeDownloads, buildDownloadAttemptList, setCardStatus, clamp, releaseRemuxUrl, getVariantById, isProbablyVideoDownloadItem, tryRemoveDownloadedFile, executeDownloadAttempts, getCardDebugLog, addDebugEntry, buildDebugReport, finalizeDebugLog, clearSegmentCheckpoint }) {
  return async (delta) => {
  await ensureInitialized();
  let entry = activeDownloads.get(delta.id);
  if (!entry) {
    const card = Object.values(getState().cards).find((item) => item.activeDownloadId === delta.id);
    if (card) {
      entry = {
        cardId: card.id,
        totalBytes: 0,
        variantId: card.selectedVariantId,
        reasonLabel: "resume",
        objectUrl: card.activeObjectUrl,
        downloadMode: card.downloadMode,
        attemptQueue: buildDownloadAttemptList(card, card.selectedVariantId),
        attemptIndex: 0
      };
      activeDownloads.set(delta.id, entry);
    }
  }
  if (!entry) {
    return;
  }

  if (typeof delta.paused?.current === "boolean" && !delta.state) {
    await setCardStatus(entry.cardId, { status: delta.paused.current ? "paused" : "downloading", stage: delta.paused.current ? "Download paused" : "Browser downloading" });
  }

  if (delta.totalBytes?.current) {
    entry.totalBytes = delta.totalBytes.current;
  }

  if (delta.bytesReceived?.current && entry.totalBytes > 0) {
    const progress = clamp((delta.bytesReceived.current / entry.totalBytes) * 100, 0, 99);
    await setCardStatus(entry.cardId, {
      status: getState().cards[entry.cardId]?.status === "paused" ? "paused" : "downloading",
      progress,
      stage: "Browser downloading",
      error: ""
    });
  }

  if (["complete", "interrupted"].includes(delta.state?.current)) {
    await releaseRemuxUrl(entry.objectUrl);
  }
  if (delta.state?.current === "complete") {
    let item = null;
    try {
      const items = await chrome.downloads.search({ id: delta.id });
      item = Array.isArray(items) ? items[0] : null;
    } catch {
      item = null;
    }
    const card = getState().cards[entry.cardId];
    const attemptedVariant = card ? getVariantById(card, entry.variantId) : null;
    const isVideo = card?.streamOptions?.audioOnly ? Boolean(item?.fileSize > 0 && (item.mime?.startsWith("audio/") || /\.(m4a|webm)$/i.test(item.filename || ""))) : isProbablyVideoDownloadItem(item, attemptedVariant);
    if (!isVideo) {
      await tryRemoveDownloadedFile(delta.id);
      activeDownloads.delete(delta.id);
      const fallbackVariantId = entry.attemptQueue?.[entry.attemptIndex + 1];
      if (fallbackVariantId) {
        try {
          await executeDownloadAttempts(entry.cardId, entry.attemptQueue, entry.attemptIndex + 1);
          return;
        } catch {
          // Fall through to final error below.
        }
      }
      await setCardStatus(entry.cardId, {
        status: "error",
        stage: "Selected method returned a non-video file",
        activeDownloadId: 0,
        error: "The selected download method completed, but the saved file was not a video."
      });
      return;
    }

    const completedLog = card ? getCardDebugLog(card) : null;
    addDebugEntry(completedLog, "info", "save", "Browser confirmed download completion", { downloadId: delta.id, fileSize: item?.fileSize });
    await setCardStatus(entry.cardId, {
      debugReport: buildDebugReport({ card: { ...card, status: "completed", stage: "Completed", error: "" }, log: finalizeDebugLog(completedLog, "completed") }),
      status: "completed",
      progress: 100,
      stage: "Completed",
      downloadMode: entry.downloadMode || "direct-copy",
      activeObjectUrl: "",
      error: "",
      activeDownloadId: 0,
      completedAt: Date.now()
    });

    activeDownloads.delete(delta.id);
    if (attemptedVariant?.isM3u8 || attemptedVariant?.type === "mpd") await clearSegmentCheckpoint(entry.cardId);
  }

  if (delta.state?.current === "interrupted") {
    activeDownloads.delete(delta.id);
    if (delta.error?.current === "USER_CANCELED") {
      await setCardStatus(entry.cardId, { status: "available", progress: 0, stage: "Download cancelled", activeDownloadId: 0, activeObjectUrl: "", error: "" });
      return;
    }
    const fallbackVariantId = entry.attemptQueue?.[entry.attemptIndex + 1];
    if (fallbackVariantId) {
      try {
        await executeDownloadAttempts(entry.cardId, entry.attemptQueue, entry.attemptIndex + 1);
        return;
      } catch {
        // Fall through to final interrupted state below.
      }
    }
    await setCardStatus(entry.cardId, {
      status: "error",
      stage: "Selected method interrupted",
      activeDownloadId: 0,
      error: delta.error?.current || "Unknown download interruption"
    });
    return;
  }
};
}
