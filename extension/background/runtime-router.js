function createBlobProgressHandler(setCardStatus, getCard) {
  return async function handleBlobProgress(message, sender) {
    if (!message.cardId) {
      return { ok: false, error: "Missing cardId" };
    }
    const card = getCard(message.cardId);
    if (!card) {
      return { ok: false, error: "Card not found" };
    }
    if (sender?.tab?.id !== card.tabId) return { ok: false, error: "Progress sender does not match download tab" };

    if (message.status === "completed") {
      await setCardStatus(message.cardId, {
        status: "completed",
        progress: 100,
        stage: message.stage || "Completed",
        downloadMode: message.mode || card.downloadMode || "blob-source-copy",
        error: "",
        activeDownloadId: 0,
        completedAt: Date.now()
      });
    } else if (message.status === "error") {
      await setCardStatus(message.cardId, {
        status: "error",
        progress: Number.isFinite(message.progress) ? message.progress : card.progress,
        stage: message.stage || "Blob download failed",
        activeDownloadId: 0,
        error: message.error || "Blob download failed"
      });
    } else {
      await setCardStatus(message.cardId, {
        status: "downloading",
        progress: Number.isFinite(message.progress) ? message.progress : card.progress,
        stage: message.stage || "Processing blob",
        downloadMode: message.mode || card.downloadMode || "blob-source-copy",
        error: ""
      });
    }

    return { ok: true };
  };
}

export function createRuntimeMessageHandler({
  ensureInitialized,
  getSettings,
  getPublicState,
  getSetupState,
  updateSettings,
  ingestCandidates,
  startDownload,
  updateVariantSelection,
  ignoreCard,
  resetBypass,
  triggerRescan,
  getCard,
  exportCardRecord,
  clearAllCache,
  setCardStatus
}) {
  const handleBlobProgress = createBlobProgressHandler(setCardStatus, getCard);

  return async function handleRuntimeMessage(message, sender) {
    await ensureInitialized();

    switch (message?.type) {
      case "GET_STATE": {
        const activeTabId = Number.isInteger(message.activeTabId) ? message.activeTabId : -1;
        return { ok: true, data: getPublicState(activeTabId) };
      }
      case "GET_SETTINGS":
        return { ok: true, data: getSettings() };
      case "GET_SETUP_STATE":
        return { ok: true, data: await getSetupState(Boolean(message.forceRefresh)) };
      case "UPDATE_SETTINGS":
        await updateSettings(message.settings);
        return { ok: true, data: getSettings() };
      case "DETECTED_CANDIDATES": {
        const tabId = Number.isInteger(sender?.tab?.id) ? sender.tab.id : -1;
        await ingestCandidates(message.candidates || [], {
          tabId,
          pageUrl: message.pageUrl,
          pageTitle: message.pageTitle
        });
        return { ok: true };
      }
      case "DOWNLOAD_CARD":
        await startDownload(message.cardId, message.variantId);
        return { ok: true };
      case "SELECT_VARIANT":
        await updateVariantSelection(message.cardId, message.variantId);
        return { ok: true };
      case "IGNORE_CARD":
        await ignoreCard(message.cardId);
        return { ok: true };
      case "RESET_BYPASS":
        await resetBypass();
        return { ok: true };
      case "RESCAN_TAB": {
        const ok = await triggerRescan(message.tabId);
        return { ok };
      }
      case "EXPORT_RECORD": {
        if (!message.cardId) {
          return { ok: false, error: "Missing cardId" };
        }
        const card = getCard(message.cardId);
        if (!card) {
          return { ok: false, error: "Card not found" };
        }
        await exportCardRecord(card);
        return { ok: true };
      }
      case "CLEAR_CACHE":
        await clearAllCache(Boolean(message.keepSettings));
        return { ok: true };
      case "BLOB_PROGRESS":
        return handleBlobProgress(message, sender);
      default:
        return { ok: false, error: "Unknown message type" };
    }
  };
}
