import { chooseBestVariant } from "../media/choose-best-variant.js";
import { normalizeStreamOptions } from "../downloads/stream-options.js";
import { createEmptyState } from "./create-empty-state.js";
import { normalizeVariant } from "../media/normalize-variant.js";
import { clamp } from "../media/clamp.js";
export function normalizeStoredState(input) {
  if (!input || typeof input !== "object" || !input.cards || typeof input.cards !== "object") {
    return createEmptyState();
  }

  const normalized = createEmptyState();
  for (const [cardId, card] of Object.entries(input.cards)) {
    if (!card || typeof card !== "object" || !Array.isArray(card.variants)) {
      continue;
    }
    normalized.cards[cardId] = {
      id: cardId,
      tabId: Number.isInteger(card.tabId) ? card.tabId : -1,
      pageUrl: typeof card.pageUrl === "string" ? card.pageUrl : "",
      pageTitle: typeof card.pageTitle === "string" ? card.pageTitle : "",
      title: typeof card.title === "string" ? card.title : "Video",
      thumbnail: typeof card.thumbnail === "string" ? card.thumbnail : "",
      thumbnailDebug: Array.isArray(card.thumbnailDebug?.entries) ? { entries: card.thumbnailDebug.entries.slice(-12) } : null,
      identityKey: typeof card.identityKey === "string" ? card.identityKey : "",
      mediaKey: typeof card.mediaKey === "string" ? card.mediaKey : "",
      ignored: Boolean(card.ignored),
      selectedVariantId: typeof card.selectedVariantId === "string" ? card.selectedVariantId : "",
      selectionLocked: Boolean(card.selectionLocked),
      status: typeof card.status === "string" ? card.status : "available",
      progress: Number.isFinite(card.progress) ? clamp(card.progress, 0, 100) : 0,
      stage: typeof card.stage === "string" ? card.stage : "Ready",
      error: typeof card.error === "string" ? card.error : "",
      downloadMode: typeof card.downloadMode === "string" ? card.downloadMode : "unknown",
      debugLogId: typeof card.debugLogId === "string" ? card.debugLogId : "",
      debugReport: typeof card.debugReport === "string" ? card.debugReport : "",
      lastValidation: card.lastValidation && typeof card.lastValidation === "object" ? card.lastValidation : null,
      activeDownloadId: Number.isInteger(card.activeDownloadId) ? card.activeDownloadId : 0,
      activeObjectUrl: typeof card.activeObjectUrl === "string" ? card.activeObjectUrl : "",
      createdAt: Number.isFinite(card.createdAt) ? card.createdAt : Date.now(),
      updatedAt: Number.isFinite(card.updatedAt) ? card.updatedAt : Date.now(),
      completedAt: Number.isFinite(card.completedAt) ? card.completedAt : 0,
      streamOptions: normalizeStreamOptions(card.streamOptions),
      frameId: Number.isInteger(card.frameId) ? card.frameId : 0,
      nativeJobId: typeof card.nativeJobId === "string" ? card.nativeJobId : "",
      variants: card.variants
        .map((variant) => normalizeVariant(variant))
        .filter(Boolean)
    };

    if (!normalized.cards[cardId].selectedVariantId && normalized.cards[cardId].variants.length > 0) {
      normalized.cards[cardId].selectedVariantId = chooseBestVariant(normalized.cards[cardId].variants).id;
    }
  }

  normalized.updatedAt = Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now();
  return normalized;
}
