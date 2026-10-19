import { createEmptyState } from "./core/storage/create-empty-state.js";
import { normalizeStoredState } from "./core/storage/normalize-stored-state.js";
import { normalizeVariant } from "./core/media/normalize-variant.js";
import { ensureVariantMethodCoverage } from "./core/media/ensure-variant-method-coverage.js";
import { clamp } from "./core/media/clamp.js";
import { normalizeType } from "./core/media/normalize-type.js";
import { detectTypeFromUrl } from "./core/media/detect-type-from-url.js";
import { extractResolution } from "./core/media/extract-resolution.js";
import { extractDimensions } from "./core/media/extract-dimensions.js";
import { extractBitrate } from "./core/media/extract-bitrate.js";
import { computeQualityScore } from "./core/media/compute-quality-score.js";
import { buildVariantLabel } from "./core/media/build-variant-label.js";
import { isPlaceholderThumbnail } from "./core/media/is-placeholder-thumbnail.js";
import { shouldReplaceThumbnail } from "./core/media/should-replace-thumbnail.js";
import { normalizeUrlForVariantKey } from "./core/media/normalize-url-for-variant-key.js";
import { extractResolutionFromLabel } from "./core/media/extract-resolution-from-label.js";
import { extractBitrateFromLabel } from "./core/media/extract-bitrate-from-label.js";
import { buildVariantSimilarityKey } from "./core/media/build-variant-similarity-key.js";
import { variantLabelDetailScore } from "./core/media/variant-label-detail-score.js";
import { getSourceStabilityScore } from "./core/media/get-source-stability-score.js";
import { variantInfoCompletenessRank } from "./core/media/variant-info-completeness-rank.js";
import { choosePreferredVariant } from "./core/media/choose-preferred-variant.js";
import { shouldReplaceVariantLabel } from "./core/media/should-replace-variant-label.js";
import { dedupeVariantsBySimilarity } from "./core/media/dedupe-variants-by-similarity.js";
import { chooseBestVariant } from "./core/media/choose-best-variant.js";
import { reconcileCardSelection } from "./core/media/reconcile-card-selection.js";
import { getVariantById } from "./core/media/get-variant-by-id.js";
import { getFileExtensionFromName } from "./core/media/get-file-extension-from-name.js";
import { isVideoFileExtension } from "./core/media/is-video-file-extension.js";
import { isNonVideoMime } from "./core/media/is-non-video-mime.js";
import { getHeaderValue } from "./core/media/get-header-value.js";
import { shouldAcceptNetworkCandidate } from "./core/media/should-accept-network-candidate.js";
import { getVariantAttemptPriority } from "./core/media/get-variant-attempt-priority.js";
import { buildDownloadAttemptList } from "./core/media/build-download-attempt-list.js";
import { isProbablyVideoDownloadItem } from "./core/media/is-probably-video-download-item.js";
import { simplifyUrlForMerge } from "./core/media/simplify-url-for-merge.js";
import { hashString } from "./core/media/hash-string.js";
import { deriveCardTitle } from "./core/media/derive-card-title.js";
import { normalizeTitleForGrouping } from "./core/media/normalize-title-for-grouping.js";
import { sanitizeFileName } from "./core/media/sanitize-file-name.js";
import { getExtensionFromType } from "./core/media/get-extension-from-type.js";
import { createMediaDebugLog, addDebugEntry, finalizeDebugLog, setDebugSummary } from "./core/debug/media-debug-log.js";
import { buildDebugReport } from "./core/debug/export-debug-report.js";
import { applyDownloadHistory, normalizeDownloadHistoryUrl, recordDownloadedUrl } from "./core/history/download-history.js";
import { parseMasterPlaylist as parseMasterPlaylistModule, choosePreferredMasterOption as choosePreferredMasterOptionModule, chooseAudioTrack, buildMasterVariantLabel as buildMasterVariantLabelModule } from "./core/hls/parse-master.js";
import { fetchTextWithRetry } from "./core/hls/download-segments.js";
import { releaseRemuxUrl } from "./core/files/save-remux.js";
import { startDirectBrowserDownload } from "./core/download-direct.js";
import { requestBlobDownload } from "./core/download-blob.js";
import { expandCandidateDownloadMethods, getVariantMethodFamily, normalizeMethodFamily } from "./core/download-methods.js";
import { collectRequestContext } from "./extension/background/request-context.js";
import { shouldUseNativeDownload, getNativeDownloadMode } from "./extension/background/job-dispatcher.js";
import { exportCardRecord as exportCardRecordFile } from "./extension/background/export-record.js";
import { createNativePortMessageHandler } from "./extension/background/native-events.js";
import { addNativePortListener, ensureNativePort, isNativeHostConnected, sendNativeCommand } from "./extension/background/native-port.js";
import { createSetupReleaseController } from "./extension/background/setup-release.js";
import { createRuntimeMessageHandler } from "./extension/background/runtime-router.js";
import { buildNativeJob } from "./extension/native/normalize-job.js";
import { EVENT_TYPES, REQUEST_TYPES, createRequestId } from "./extension/native/protocol.js";
import { createHlsDownloader } from "./extension/background/hls-pipeline.js";
import { fetchPlaylist } from "./core/hls/fetch-playlist.js";
import { expandMasterOptions } from "./core/hls/expand-master.js";
import { retainDownloadTask } from "./core/history/retain-download-task.js";
import { getVisibleCards } from "./extension/background/visible-cards.js";
import { createOperationRegistry, operationError, throwIfAborted } from "./core/tasks/operation-control.js";
import { recoverDownloads } from "./extension/background/recover-downloads.js";
import { createDownloadControls } from "./extension/background/download-controls.js";
import { clearSegmentCheckpoint } from "./core/hls/segment-checkpoint.js";
import { recoverRemux } from "./core/remux/recover-remux.js";
import { createDownloadQueue, STREAM_RESERVATION, DIRECT_RESERVATION } from "./core/tasks/download-queue.js";
import { createStateWriter } from "./core/storage/state-writer.js";
import { compactPublicState } from "./core/storage/public-state.js";
import { collectTemporaryFiles } from "./core/files/storage-maintenance.js";
import { formatDownloadFileName } from "./core/downloads/file-name.js";
import { normalizeStreamOptions } from "./core/downloads/stream-options.js";
import { createDownloadProgressMonitor } from "./extension/background/download-progress.js";
import { downloadSubtitle } from "./extension/background/subtitle-download.js";
import { createDashDownloader } from "./extension/background/dash-pipeline.js";
import { createCardMerger } from "./extension/background/merge-cards.js";
import { createDownloadEventHandler } from "./extension/background/download-events.js";
import { parseMpd } from "./core/dash/parse-mpd.js";
import { getSitePolicy, normalizeSitePolicies } from "./core/settings/site-policy.js";
import { createDiscoveryCache } from "./core/media/discovery-cache.js";
import { createStorageManager } from "./extension/background/storage-manager.js";
import { checkNativeHealth } from "./extension/native/health-check.js";
import { previewMedia } from "./extension/background/media-preview.js";
import { capturePlayerView } from "./extension/background/capture-player-view.js";
import { downloadWithoutCredentials } from "./core/downloads/credential-free-direct.js";

const STATE_KEY = "vd_state_v1";
const SETTINGS_KEY = "vd_settings_v1";
const DOWNLOAD_HISTORY_KEY = "vd_download_history_v1";

const VIDEO_TYPES = ["mp4", "webm", "m3u8", "mpd", "blob", "mov", "m4v", "mkv", "avi", "flv", "mpeg"];

const DEFAULT_SETTINGS = {
  locale: "en",
  fileNameRule: "{title}",
  nativeHelperEnabled: false,
  maxActiveDownloads: 2,
  sitePolicies: {},
  enabledTypes: {
    mp4: true,
    webm: true,
    m3u8: true,
    mpd: true,
    blob: true,
    mov: true,
    m4v: true,
    mkv: true,
    avi: true,
    flv: true,
    mpeg: true
  },
  preserveOldPages: false,
  downloadHistoryEnabled: true
};

let initialized = false;
let initializationPromise;
const startingCards = new Set();
const downloadOperations = createOperationRegistry();
let settings = structuredClone(DEFAULT_SETTINGS);
let state = createEmptyState();
let downloadHistory = [];

const tabMeta = new Map();
const activeDownloads = new Map();
const nativeJobs = new Map();
const m3u8MasterCache = new Map();
const networkResponseMeta = new Map();
const debugLogs = new Map();
const M3U8_CACHE_TTL_MS = 5 * 60 * 1000;
const PAGE_THUMB_CACHE_TTL_MS = 30 * 1000;
const pageThumbnailCache = new Map();
const VIDEO_FILE_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "mkv", "avi", "flv", "mpeg", "mpg", "ts", "m2ts"]);

function cloneSettingsWithDefaults(input) {
  const merged = structuredClone(DEFAULT_SETTINGS);
  if (!input || typeof input !== "object") {
    return merged;
  }
  if (typeof input.preserveOldPages === "boolean") {
    merged.preserveOldPages = input.preserveOldPages;
  }
  if (typeof input.downloadHistoryEnabled === "boolean") {
    merged.downloadHistoryEnabled = input.downloadHistoryEnabled;
  }
  if (typeof input.nativeHelperEnabled === "boolean") merged.nativeHelperEnabled = input.nativeHelperEnabled;
  merged.maxActiveDownloads = Math.min(4, Math.max(1, Math.floor(Number(input.maxActiveDownloads) || 2)));
  merged.sitePolicies = normalizeSitePolicies(input.sitePolicies);
  if (typeof input.fileNameRule === "string") merged.fileNameRule = input.fileNameRule.slice(0, 160) || "{title}";
  if (typeof input.locale === "string") {
    merged.locale = input.locale;
  }
  if (input.enabledTypes && typeof input.enabledTypes === "object") {
    for (const type of VIDEO_TYPES) {
      if (typeof input.enabledTypes[type] === "boolean") {
        merged.enabledTypes[type] = input.enabledTypes[type];
      }
    }
  }
  return merged;
}

async function ensureInitialized() {
  if (initialized) return;
  if (!initializationPromise) initializationPromise = initializeState().catch((error) => {
    initializationPromise = null;
    throw error;
  });
  return initializationPromise;
}

async function initializeState() {
  const stored = await chrome.storage.local.get([STATE_KEY, SETTINGS_KEY, DOWNLOAD_HISTORY_KEY, "vd_history_identity_version"]);
  settings = cloneSettingsWithDefaults(stored[SETTINGS_KEY]);
  downloadQueue.configure(settings.maxActiveDownloads);
  state = normalizeStoredState(stored[STATE_KEY]);
  // Legacy records discarded every query parameter, so their identities cannot be safely migrated.
  downloadHistory = stored.vd_history_identity_version === 2 ? normalizeDownloadHistoryEntries(stored[DOWNLOAD_HISTORY_KEY]) : [];
  if (stored.vd_history_identity_version !== 2) {
    await chrome.storage.local.set({ [DOWNLOAD_HISTORY_KEY]: downloadHistory, vd_history_identity_version: 2,
      ...(Array.isArray(stored[DOWNLOAD_HISTORY_KEY]) && stored[DOWNLOAD_HISTORY_KEY].length ? { vd_download_history_legacy_backup: stored[DOWNLOAD_HISTORY_KEY] } : {}) });
  }
  let migrated = false;
  for (const card of Object.values(state.cards)) {
    if (!card || !Array.isArray(card.variants) || card.variants.length === 0) {
      continue;
    }
    let cardChanged = false;
    const withMethods = ensureVariantMethodCoverage(card.variants);
    if (withMethods.changed) {
      card.variants = withMethods.variants;
      cardChanged = true;
    }
    const deduped = dedupeVariantsBySimilarity(card.variants);
    if (deduped.changed) {
      card.variants = deduped.variants;
      cardChanged = true;
    }
    if (reconcileCardSelection(card)) {
      cardChanged = true;
    }
    if (cardChanged) {
      migrated = true;
      card.updatedAt = Date.now();
    }
  }
  const pageKeySet = new Set(
    Object.values(state.cards)
      .filter((card) => card && card.pageUrl)
      .map((card) => `${card.tabId}|${card.pageUrl}`)
  );
  for (const pageKey of pageKeySet) {
    const divider = pageKey.indexOf("|");
    const tabId = Number(pageKey.slice(0, divider));
    const pageUrl = pageKey.slice(divider + 1);
    if (Number.isInteger(tabId) && pageUrl && mergeCardsBySameTitle(tabId, pageUrl)) {
      migrated = true;
    }
  }
  const recovered = await recoverDownloads(state.cards, {
    downloads: chrome.downloads, tabs: chrome.tabs,
    recoverRemux,
    isVideo: (item, card) => isProbablyVideoDownloadItem(item, getVariantById(card, card.selectedVariantId))
  });
  if (recovered) {
    for (const card of Object.values(state.cards)) {
      if (card.status === "completed" && (getVariantById(card, card.selectedVariantId)?.isM3u8 || getVariantById(card, card.selectedVariantId)?.type === "mpd")) await clearSegmentCheckpoint(card.id);
      if (card.status === "completed" && settings.downloadHistoryEnabled) {
        downloadHistory = recordDownloadedUrl(downloadHistory, getVariantById(card, card.selectedVariantId)?.url || "");
      }
    }
    await persistDownloadHistory();
  }
  if (migrated || recovered) {
    await persistState();
  }
  const cleanup = await collectTemporaryFiles(state.cards);
  console.debug("Temporary storage startup cleanup", cleanup);
  for (const card of Object.values(state.cards)) {
    if (card.status === "queued") { card.status = "paused"; card.stage = "Queued task interrupted; resume"; }
    if (card.status === "downloading" || (card.status === "paused" && card.activeDownloadId)) downloadQueue.restore(card.id, reservationFor(getVariantById(card, card.selectedVariantId), card));
  }
  await persistState();
  initialized = true;
  progressMonitor.start();
  await chrome.alarms?.create("temporary-cleanup", { periodInMinutes: 60 });
}

async function persistState() {
  state.updatedAt = Date.now();
  await stateWriter.flush();
}

async function persistSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

function normalizeDownloadHistoryEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  const unique = new Set();
  for (const entry of entries) {
    const normalizedUrl = normalizeDownloadHistoryUrl(entry);
    if (normalizedUrl) {
      unique.add(normalizedUrl);
    }
  }
  return [...unique];
}

async function persistDownloadHistory() {
  await chrome.storage.local.set({ [DOWNLOAD_HISTORY_KEY]: downloadHistory });
}

let broadcastTimer;
function broadcastStateUpdated() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => { broadcastTimer = null; chrome.runtime.sendMessage({ type: "STATE_UPDATED" }).catch(() => {}); }, 150);
  broadcastTimer.unref?.();
}

function cacheNetworkResponseMeta(details) {
  if (!details?.url) {
    return;
  }
  if (networkResponseMeta.size >= 2000) networkResponseMeta.delete(networkResponseMeta.keys().next().value);
  networkResponseMeta.set(details.url, {
    statusCode: Number.isInteger(details.statusCode) ? details.statusCode : 0,
    requestType: typeof details.type === "string" ? details.type : "",
    contentType: getHeaderValue(details.responseHeaders, "content-type"),
    contentDisposition: getHeaderValue(details.responseHeaders, "content-disposition"),
    contentLength: getHeaderValue(details.responseHeaders, "content-length"),
    observedAt: Date.now()
  });
}

async function tryRemoveDownloadedFile(downloadId) {
  try {
    await chrome.downloads.removeFile(downloadId);
  } catch {
    // Ignore when file cannot be removed.
  }
  try {
    await chrome.downloads.erase({ id: downloadId });
  } catch {
    // Ignore when entry cannot be erased.
  }
}

function shouldAcceptType(type) {
  const normalized = normalizeType(type);
  if (!normalized) {
    return false;
  }
  return Boolean(settings.enabledTypes[normalized]);
}

async function getTabInfo(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return { url: "", title: "" };
  }
  if (tabMeta.has(tabId)) {
    return tabMeta.get(tabId);
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    const info = {
      url: typeof tab.url === "string" ? tab.url : "",
      title: typeof tab.title === "string" ? tab.title : ""
    };
    tabMeta.set(tabId, info);
    return info;
  } catch {
    return { url: "", title: "" };
  }
}

async function requestPageThumbnail(tabId, frameId = 0, mediaUrl = "") {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return "";
  }
  const cacheKey = `${frameId}:${mediaUrl}`;
  const frameCache = pageThumbnailCache.get(tabId) || new Map();
  const cached = frameCache.get(cacheKey);
  const now = Date.now();
  if (cached?.thumbnail && now - cached.cachedAt < PAGE_THUMB_CACHE_TTL_MS) {
    return cached.thumbnail || "";
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_THUMBNAIL", mediaUrl }, { frameId });
    const thumbnail = response?.ok && typeof response.thumbnail === "string" ? response.thumbnail : "";
    if (frameCache.size >= 50) frameCache.delete(frameCache.keys().next().value);
    frameCache.set(cacheKey, {
      thumbnail,
      cachedAt: now
    });
    pageThumbnailCache.set(tabId, frameCache);
    return thumbnail;
  } catch {
    return "";
  }
}

const mergeCardsBySameTitle = createCardMerger({ getState: () => state, normalizeTitleForGrouping, retainDownloadTask, shouldReplaceThumbnail, dedupeVariantsBySimilarity, reconcileCardSelection });

function cleanupForNonPreserve(tabId, pageUrl) {
  if (settings.preserveOldPages) {
    return;
  }
  for (const [cardId, card] of Object.entries(state.cards)) {
    const sameTab = card.tabId === tabId;
    const samePage = pageUrl ? card.pageUrl === pageUrl : true;
    if ((!sameTab || !samePage) && !retainDownloadTask(card)) {
      delete state.cards[cardId];
    }
  }
}

async function ingestCandidates(candidates, context) {
  await ensureInitialized();
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return;
  }

  const tabId = Number.isInteger(context?.tabId) ? context.tabId : -1;
  const tabInfo = await getTabInfo(tabId);
  const pageUrl = context?.pageUrl || tabInfo.url || "";
  const pageTitle = context?.pageTitle || tabInfo.title || "";
  if (!getSitePolicy(settings, pageUrl).detection) return;
  if (context?.scanMetrics) {
    if (scanMetrics.size >= 100) scanMetrics.delete(scanMetrics.keys().next().value);
    const metrics = context.scanMetrics;
    scanMetrics.set(`${tabId}:${context.frameId || 0}`, { scans: Number(metrics.scans) || 0, skipped: Number(metrics.skipped) || 0, elapsedMs: Number(metrics.elapsedMs) || 0 });
  }

  cleanupForNonPreserve(tabId, pageUrl);

  let changed = false;
  const expandedCandidates = await expandM3u8Candidates(candidates);
  for (const candidate of expandedCandidates) if (candidate.type === "mpd") {
    try { const tracks = await dashDiscovery.get(candidate.url, async () => parseMpd(await fetchTextWithRetry(candidate.url, { maxBytes: 2 * 1024 * 1024, credentials: getSitePolicy(settings, pageUrl).credentials ? "include" : "omit" }), candidate.url)); candidate.audioTracks = tracks.filter((track) => track.kind === "audio").map((track) => ({ language: track.language, name: track.id, uri: track.id })); }
    catch (error) { console.debug("DASH discovery:", error.message); }
  }
  const touchedCardIds = new Set();

  for (const rawCandidate of expandedCandidates) {
    if (!rawCandidate || typeof rawCandidate.url !== "string") {
      continue;
    }

    const detectedType = normalizeType(rawCandidate.type || detectTypeFromUrl(rawCandidate.url));
    if (!detectedType || !shouldAcceptType(detectedType)) {
      continue;
    }

    const mediaKey = simplifyUrlForMerge(rawCandidate.url);
    const mergeBase = rawCandidate.identityKey || rawCandidate.mergeKey || mediaKey;
    const cardSeed = `${tabId}|${pageUrl}|${mergeBase}`;
    const cardId = `card_${hashString(cardSeed)}`;

    if (!state.cards[cardId]) {
      state.cards[cardId] = {
        id: cardId,
        tabId, frameId: context?.frameId || 0,
        pageUrl,
        pageTitle,
        title: deriveCardTitle(rawCandidate, pageTitle),
        thumbnail: rawCandidate.thumbnail || createDefaultThumbnail(detectedType),
        identityKey: typeof rawCandidate.identityKey === "string" ? rawCandidate.identityKey : "",
        mediaKey,
        ignored: false,
        selectedVariantId: "",
        selectionLocked: false,
        status: "available",
        progress: 0,
        stage: "Ready",
        error: "",
        downloadMode: "unknown",
        debugLogId: "",
        debugReport: "",
        lastValidation: null,
        activeDownloadId: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: 0,
        variants: []
      };
      changed = true;
    }

    const card = state.cards[cardId];
    touchedCardIds.add(cardId);
    card.tabId = tabId;
    card.pageUrl = pageUrl;
    card.pageTitle = pageTitle;
    if (!card.identityKey && typeof rawCandidate.identityKey === "string") {
      card.identityKey = rawCandidate.identityKey;
      changed = true;
    }
    if (!card.mediaKey && mediaKey) {
      card.mediaKey = mediaKey;
      changed = true;
    }
    if (rawCandidate.thumbnailDebug) card.thumbnailDebug = rawCandidate.thumbnailDebug;
    if (shouldReplaceThumbnail(card.thumbnail, rawCandidate.thumbnail)) {
      card.thumbnail = rawCandidate.thumbnail;
      changed = true;
    }
    if (
      (!card.thumbnail || isPlaceholderThumbnail(card.thumbnail))
    ) {
      const tabThumbnail = await requestPageThumbnail(tabId, context?.frameId || 0, rawCandidate.url);
      if (shouldReplaceThumbnail(card.thumbnail, tabThumbnail)) {
        card.thumbnail = tabThumbnail;
        changed = true;
      }
    }

    const methodCandidates = expandCandidateDownloadMethods(rawCandidate, detectedType);
    for (const methodCandidate of methodCandidates) {
      const methodFamily = normalizeMethodFamily(methodCandidate.methodFamily);
      const variantSeed = detectedType === "m3u8"
        ? `${methodCandidate.url}|${detectedType}|${methodFamily}`
        : `${methodCandidate.url}|${detectedType}|${methodFamily}|${methodCandidate.source || "unknown"}`;
      const variantId = `variant_${hashString(variantSeed)}`;

      const existingVariant = card.variants.find((variant) => variant.id === variantId);
      if (!existingVariant) {
        card.variants.push({
          id: variantId,
          url: methodCandidate.url,
          audioTracks: methodCandidate.audioTracks || [], subtitleTracks: methodCandidate.subtitleTracks || [], codecs: methodCandidate.codecs || "",
          audioUrl: methodCandidate.audioUrl || "",
          masterUrl: methodCandidate.masterUrl || "",
          type: detectedType,
          methodFamily,
          source: methodCandidate.source || "unknown",
          label: methodCandidate.label || buildVariantLabel(methodCandidate.url, detectedType),
          score: Number.isFinite(methodCandidate.score)
            ? methodCandidate.score
            : computeQualityScore(methodCandidate.url, detectedType),
          isBlob: detectedType === "blob",
          isM3u8: detectedType === "m3u8",
          detectedAt: Date.now()
        });
        changed = true;
      } else {
        for (const key of ["audioUrl", "masterUrl", "audioTracks", "subtitleTracks", "codecs"]) {
          if (methodCandidate[key] && existingVariant[key] !== methodCandidate[key]) {
            existingVariant[key] = methodCandidate[key];
            changed = true;
          }
        }
        if (shouldReplaceVariantLabel(existingVariant.label, methodCandidate.label)) {
          existingVariant.label = methodCandidate.label;
          changed = true;
        }
        if (Number.isFinite(methodCandidate.score) && methodCandidate.score > (existingVariant.score || 0)) {
          existingVariant.score = methodCandidate.score;
          changed = true;
        }
        if (typeof methodCandidate.source === "string" && methodCandidate.source && methodCandidate.source !== existingVariant.source) {
          existingVariant.source = methodCandidate.source;
          changed = true;
        }
      }
    }
  }

  for (const cardId of touchedCardIds) {
    const card = state.cards[cardId];
    if (!card || !Array.isArray(card.variants) || card.variants.length === 0) {
      continue;
    }

    let cardChanged = false;
    const deduped = dedupeVariantsBySimilarity(card.variants);
    if (deduped.changed) {
      card.variants = deduped.variants;
      cardChanged = true;
    }
    if (reconcileCardSelection(card)) {
      cardChanged = true;
    }
    if (cardChanged) {
      card.updatedAt = Date.now();
      changed = true;
    }
  }

  if (mergeCardsBySameTitle(tabId, pageUrl)) {
    changed = true;
  }

  if (changed) {
    await persistState();
    broadcastStateUpdated();
  }
}

function createDefaultThumbnail(type) {
  const bg = type === "m3u8" ? "#ffd166" : "#8ecae6";
  const text = type.toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='320' height='180' fill='${bg}'/><text x='50%' y='50%' font-size='34' text-anchor='middle' fill='#0f172a' dominant-baseline='middle' font-family='sans-serif'>${text}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function getPublicState(activeTabId, all = false) {
  const filtered = all ? Object.values(state.cards).filter((card) => !card.ignored) : getVisibleCards(Object.values(state.cards), activeTabId, settings);

  const sorted = filtered.sort((a, b) => {
    const aTimestamp = a.status === "completed"
      ? (a.completedAt || a.createdAt || 0)
      : (a.createdAt || 0);
    const bTimestamp = b.status === "completed"
      ? (b.completedAt || b.createdAt || 0)
      : (b.createdAt || 0);
    if (bTimestamp !== aTimestamp) {
      return bTimestamp - aTimestamp;
    }
    return String(a.title || "").localeCompare(String(b.title || ""));
  });

  return {
    cards: applyDownloadHistory(sorted, downloadHistory, settings),
    settings,
    updatedAt: state.updatedAt
  };
}

function createCardDebugLog(card, variant) {
  if (debugLogs.size >= 100) debugLogs.delete(debugLogs.keys().next().value);
  const log = createMediaDebugLog({
    cardId: card.id,
    title: card.title,
    pageUrl: card.pageUrl,
    variantUrl: variant.url,
    variantLabel: variant.label,
    sourceType: variant.type
  });
  debugLogs.set(log.id, log);
  card.debugLogId = log.id;
  return log;
}

function getCardDebugLog(card) {
  return card?.debugLogId ? debugLogs.get(card.debugLogId) || null : null;
}

async function setCardStatus(cardId, patch) {
  const previous = state.cards[cardId]?.status;
  const card = state.cards[cardId];
  if (!card) {
    return;
  }
  if (typeof patch.status === "string") {
    card.status = patch.status;
  }
  if (Number.isFinite(patch.progress)) {
    card.progress = clamp(patch.progress, 0, 100);
  }
  if (typeof patch.stage === "string") {
    card.stage = patch.stage;
  }
  if (typeof patch.error === "string") {
    card.error = patch.error;
  }
  if (typeof patch.downloadMode === "string") {
    card.downloadMode = patch.downloadMode;
  }
  if (typeof patch.debugLogId === "string") {
    card.debugLogId = patch.debugLogId;
  }
  if (typeof patch.debugReport === "string") {
    card.debugReport = patch.debugReport;
  }
  if (patch.lastValidation === null || (patch.lastValidation && typeof patch.lastValidation === "object")) {
    card.lastValidation = patch.lastValidation;
  }
  if (Number.isInteger(patch.activeDownloadId)) {
    card.activeDownloadId = patch.activeDownloadId;
  }
  if (Number.isFinite(patch.completedAt)) {
    card.completedAt = patch.completedAt;
  }
  if (typeof patch.activeObjectUrl === "string") card.activeObjectUrl = patch.activeObjectUrl;
  if (typeof patch.nativeJobId === "string") {
    card.nativeJobId = patch.nativeJobId;
  }
  for (const key of ["bytesReceived", "totalBytes", "speed", "eta"]) if (key in patch) card[key] = patch[key];
  let historyChanged = false;
  if (card.status === "completed" && Number.isFinite(patch.completedAt) && settings.downloadHistoryEnabled) {
    const selectedVariant = getVariantById(card, card.selectedVariantId);
    const nextHistory = recordDownloadedUrl(downloadHistory, selectedVariant?.url || "");
    historyChanged = nextHistory.length !== downloadHistory.length;
    downloadHistory = nextHistory;
  }
  card.updatedAt = Math.max(Date.now(), (card.updatedAt || 0) + 1);
  if (historyChanged) {
    await persistDownloadHistory();
  }
  const important = previous !== card.status || "activeDownloadId" in patch || "debugReport" in patch || historyChanged;
  if (important) await persistState(); else stateWriter.schedule();
  broadcastStateUpdated();
  if (card.activeDownloadId) progressMonitor.start();
  if ((["completed", "error", "available"].includes(card.status) || (card.status === "paused" && !card.activeDownloadId && !card.nativeJobId && !getVariantById(card, card.selectedVariantId)?.isBlob)) && !startingCards.has(cardId)) downloadQueue.release(cardId);
}

function findCardByNativeJobId(jobId) {
  if (!jobId) {
    return null;
  }
  const cachedCardId = nativeJobs.get(jobId);
  if (cachedCardId && state.cards[cachedCardId]?.nativeJobId === jobId) {
    return state.cards[cachedCardId];
  }
  const card = Object.values(state.cards).find((item) => item.nativeJobId === jobId) || null;
  if (card) {
    nativeJobs.set(jobId, card.id);
  }
  return card;
}

function buildFileName(card, variant, overrideExt) {
  return formatDownloadFileName(card, variant, overrideExt || getExtensionFromType(variant.type), settings.fileNameRule);
}

async function startNativeVariant(card, variant) {
  const requestContext = await collectRequestContext({ card, variant, allowCookies: getSitePolicy(settings, card.pageUrl).credentials });
  const nativeJob = buildNativeJob({
    card: {
      ...card,
      title: sanitizeFileName(card.title || "video")
    },
    variant,
    requestContext
  });
  nativeJob.outputName = buildFileName(card, variant, variant.isM3u8 ? "mp4" : "");

  await setCardStatus(card.id, {
    status: "downloading",
    progress: 3,
    stage: "Dispatching native job",
    downloadMode: getNativeDownloadMode(variant),
    activeDownloadId: 0,
    nativeJobId: nativeJob.jobId,
    error: ""
  });

  nativeJobs.set(nativeJob.jobId, card.id);
  await sendNativeCommand({
    type: REQUEST_TYPES.START_JOB,
    requestId: createRequestId("job"),
    job: nativeJob
  });

  return nativeJob.jobId;
}

async function requestNativeReport(jobId) {
  if (!jobId) {
    return;
  }
  try {
    await sendNativeCommand({
      type: REQUEST_TYPES.EXPORT_REPORT,
      requestId: createRequestId("report"),
      jobId
    });
  } catch {
    // Ignore report export failures and preserve the original download result.
  }
}

const handleNativePortMessage = createNativePortMessageHandler({
  EVENT_TYPES,
  getStateCards: () => Object.values(state.cards),
  findCardByNativeJobId,
  setCardStatus,
  requestNativeReport,
  fallbackNativeDownload
});

const setupReleaseController = createSetupReleaseController({
  ensureNativePort,
  isEnabled: () => settings.nativeHelperEnabled,
  isNativeHostConnected
});

async function fallbackNativeDownload(card, message) {
  const previous = downloadOperations.get(card.id);
  if (previous) await previous.done;
  if (card.status === "paused") {
    await setCardStatus(card.id, { nativeJobId: "", stage: "Native host disconnected; resume saved segments" });
    return;
  }
  if (card.status !== "downloading") return;
  const operation = downloadOperations.begin(card.id);
  startingCards.add(card.id);
  try {
  const variantId = card.selectedVariantId;
  const log = getCardDebugLog(card) || createCardDebugLog(card, getVariantById(card, variantId));
  addDebugEntry(log, "warn", "native", "Native download failed; using extension fallback", { error: message.error || message.message || "Native disconnected" });
  nativeJobs.delete(card.nativeJobId);
  await setCardStatus(card.id, { nativeJobId: "", error: "" });
  const result = await attemptDownloadVariant(card.id, variantId, "extension-fallback");
  if (!result.ok) {
    const attempts = buildDownloadAttemptList(card, variantId);
    try { await executeDownloadAttempts(card.id, attempts, 1); } catch { /* Attempt already saved the error. */ }
  } else if (result.pending && card.activeDownloadId) {
    const entry = activeDownloads.get(card.activeDownloadId);
    if (entry) entry.attemptQueue = buildDownloadAttemptList(card, variantId);
  }
  } finally { startingCards.delete(card.id); operation.finish(); if (card.status !== "downloading") downloadQueue.release(card.id); }
}

async function attemptDownloadVariant(cardId, variantId, reasonLabel) {
  const card = state.cards[cardId];
  if (!card) {
    return { ok: false, error: "Card not found" };
  }

  const variant = getVariantById(card, variantId);
  if (!variant) {
    return { ok: false, error: "Variant not found" };
  }

  try {
    card.selectedVariantId = variant.id;
    throwIfAborted(downloadOperations.get(card.id)?.controller.signal);
    const log = getCardDebugLog(card) || createCardDebugLog(card, variant);
    addDebugEntry(log, "info", "attempt", "Starting download method", { variantId, reasonLabel });
    await setCardStatus(card.id, {
      status: "downloading",
      progress: 2,
      stage: "Preparing selected method",
      activeDownloadId: 0,
      nativeJobId: "",
      completedAt: 0,
      error: ""
    });

    if (variant.isBlob) {
      await downloadBlobVariant(card, variant);
      return { ok: true, pending: false };
    }
    if (settings.nativeHelperEnabled && getSitePolicy(settings, card.pageUrl).native && !card.streamOptions?.audioOnly && !card.streamOptions?.audioLanguage && !card.streamOptions?.liveSeconds && variant.type !== "mpd" && reasonLabel !== "extension-fallback" && shouldUseNativeDownload(variant)) {
      try {
        await ensureNativePort();
        throwIfAborted(downloadOperations.get(card.id)?.controller.signal);
        await startNativeVariant(card, variant);
        return { ok: true, pending: true };
      } catch (nativeError) {
        if (nativeError?.name === "AbortError") throw nativeError;
        const nativeMessage = nativeError instanceof Error ? nativeError.message : String(nativeError);
        await setCardStatus(card.id, {
          status: "downloading",
          progress: 4,
          nativeJobId: "",
          stage: "Native host unavailable, using extension fallback",
          error: ""
        });
        addDebugEntry?.(getCardDebugLog(card) || createMediaDebugLog({
          cardId: card.id,
          title: card.title,
          pageUrl: card.pageUrl
        }), "warn", "native", "Native host unavailable, falling back", {
          error: nativeMessage
        });
      }
    }
    if (variant.type === "mpd") {
      await downloadDashVariant(card, variant, downloadOperations.get(card.id)?.controller.signal);
      return { ok: true, pending: true };
    }
    if (variant.isM3u8) {
      await downloadM3u8Variant(card, variant, downloadOperations.get(card.id)?.controller.signal);
      return { ok: true, pending: true };
    }

    throwIfAborted(downloadOperations.get(card.id)?.controller.signal);
    await downloadDirectVariant(card, variant, {
      reasonLabel
    });
    return { ok: true, pending: true };
  } catch (error) {
    if (error?.name === "AbortError") {
      const action = error.action || "cancel";
      addDebugEntry(getCardDebugLog(card), "info", "control", "Download operation stopped", { action });
      const stopped = { status: action === "pause" ? "paused" : "available", stage: action === "pause" ? "Download paused" : "Download cancelled", activeDownloadId: 0, error: "" };
      await setCardStatus(card.id, { ...stopped, debugReport: buildDebugReport({ card: { ...card, ...stopped }, log: finalizeDebugLog(getCardDebugLog(card), action === "pause" ? "paused" : "cancelled") }) });
      return { ok: true, pending: false };
    }
    const finalError = error instanceof Error ? error.message : String(error);
    const log = getCardDebugLog(card);
    addDebugEntry(log, "error", "attempt", "Download method failed", { variantId, error: finalError });
    await setCardStatus(card.id, {
      status: "error",
      stage: "Selected method failed",
      activeDownloadId: 0,
      error: finalError,
      debugReport: buildDebugReport({ card: { ...card, status: "error", error: finalError }, log: finalizeDebugLog(log, "failed", { error: finalError }) })
    });
    return { ok: false, error: finalError };
  }
}

async function executeDownloadAttempts(cardId, attempts, startIndex = 0) {
  const card = state.cards[cardId];
  if (!card) {
    throw new Error("Card not found");
  }
  let lastError = "Selected method failed";
  for (let index = startIndex; index < attempts.length; index += 1) {
    const attemptVariantId = attempts[index];
    const result = await attemptDownloadVariant(card.id, attemptVariantId, index === 0 ? "manual" : "auto-switch");
    if (result.ok) {
      if (!result.pending) {
        return;
      }
      const activeCard = state.cards[card.id];
      if (activeCard?.activeDownloadId) {
        const entry = activeDownloads.get(activeCard.activeDownloadId);
        if (entry) {
          entry.attemptQueue = attempts;
          entry.attemptIndex = index;
        }
      }
      return;
    }
    lastError = result.error || lastError;
  }
  throw new Error(lastError);
}

async function startDownload(cardId, variantId, options) {
  await ensureInitialized();
  const card = state.cards[cardId];
  if (!card) throw new Error("Card not found");
  const variant = card.variants.find((item) => item.id === variantId) || card.variants.find((item) => item.id === card.selectedVariantId);
  if (!variant) throw new Error("Variant not found");
  if (downloadQueue.has(cardId) || startingCards.has(cardId) || ["queued", "downloading", "paused"].includes(card.status)) throw new Error("Download already in progress; use Resume");
  card.streamOptions = normalizeStreamOptions(options || card.streamOptions);
  card.requestCredentials = getSitePolicy(settings, card.pageUrl).credentials ? "include" : "omit";
  if ((card.streamOptions.audioOnly || card.streamOptions.audioLanguage || card.streamOptions.liveSeconds) && !variant.isM3u8 && variant.type !== "mpd") throw new Error("Track selection and timed saving require HLS or DASH");
  card.selectedVariantId = variant.id;
  createCardDebugLog(card, variant);
  await setCardStatus(cardId, { status: "queued", stage: "Queued", progress: 0, error: "" });
  const entry = downloadQueue.enqueue(cardId, Math.max(...card.variants.map((variant) => reservationFor(variant, card))), async () => {
    startingCards.add(cardId);
    const operation = downloadOperations.begin(cardId);
    try { await executeDownloadAttempts(card.id, (card.streamOptions.audioOnly || card.streamOptions.audioLanguage || card.streamOptions.liveSeconds || variant.type === "mpd" ? [variant.id] : buildDownloadAttemptList(card, variant.id)), 0); }
    finally {
      startingCards.delete(cardId); operation.finish();
      if (card.status !== "downloading") downloadQueue.release(cardId);
    }
  }, async (error) => { await setCardStatus(cardId, { status: "error", stage: "Download failed", error: String(error.message || error) }); downloadQueue.release(cardId); });
  if (entry.started) await entry.done;
}

const controlActiveDownload = createDownloadControls({
  getCard: (id) => state.cards[id], operations: downloadOperations,
  setCardStatus, startDownload, getCardDebugLog, sendNativeCommand, activeDownloads
});

async function controlDownload(cardId, action) {
  const card = state.cards[cardId];
  if (card?.status === "queued" && ["cancel", "pause"].includes(action)) {
    if (!downloadQueue.cancel(cardId)) throw new Error("Task is starting; retry control");
    if (action === "cancel" && (getVariantById(card, card.selectedVariantId)?.isM3u8 || getVariantById(card, card.selectedVariantId)?.type === "mpd")) await clearSegmentCheckpoint(cardId);
    const log = getCardDebugLog(card);
    addDebugEntry(log, "info", "control", "Queued task stopped", { action });
    const patch = { status: action === "pause" ? "paused" : "available", stage: action === "pause" ? "Download paused" : "Download cancelled" };
    await setCardStatus(cardId, { ...patch, debugReport: buildDebugReport({ card: { ...card, ...patch }, log: finalizeDebugLog(log, action === "pause" ? "paused" : "cancelled") }) });
    return;
  }
  await controlActiveDownload(cardId, action);
  if (card && (card.status === "available" || (card.status === "paused" && !card.activeDownloadId && !card.nativeJobId && !getVariantById(card, card.selectedVariantId)?.isBlob))) downloadQueue.release(cardId);
}

async function exportCardRecord(card) {
  await exportCardRecordFile({
    card,
    ensureInitialized,
    requestNativeReport,
    getCardDebugLog,
    buildDebugReport,
    createMediaDebugLog,
    sanitizeFileName,
    chromeDownloads: chrome.downloads
  });
}

async function downloadDirectVariant(card, variant, context) {
  const filename = buildFileName(card, variant);
  const credentialFree = card.requestCredentials === "omit" ? await downloadWithoutCredentials(variant.url, filename, card.id, downloadOperations.get(card.id)?.controller.signal) : null;
  const downloadId = credentialFree?.downloadId || await startDirectBrowserDownload(chrome.downloads, {
    url: variant.url,
    filename
  });

  if (!Number.isInteger(downloadId)) {
    throw new Error("Failed to start browser download");
  }

  activeDownloads.set(downloadId, {
    cardId: card.id,
    totalBytes: 0,
    variantId: variant.id,
    reasonLabel: typeof context?.reasonLabel === "string" ? context.reasonLabel : "manual",
    objectUrl: credentialFree?.objectUrl,
    attemptQueue: Array.isArray(context?.attemptQueue) ? [...context.attemptQueue] : [variant.id],
    attemptIndex: Number.isInteger(context?.attemptIndex) ? context.attemptIndex : 0
  });

  await setCardStatus(card.id, {
    status: "downloading",
    progress: 5,
    stage: "Browser download started",
    downloadMode: "direct-copy",
    activeDownloadId: downloadId,
    activeObjectUrl: credentialFree?.objectUrl || "",
    lastValidation: credentialFree?.validation || null,
    error: ""
  });
}

async function downloadBlobVariant(card, variant) {
  const filenameBase = buildFileName(card, variant, "webm").replace(/\.webm$/, "");
  const response = await requestBlobDownload(card.tabId, {
    cardId: card.id,
    blobUrl: variant.url,
    filenameBase,
    methodFamily: getVariantMethodFamily(variant)
  }, card.frameId || 0);

  if (!response || response.ok !== true) {
    if (response?.cancelled) throw operationError();
    throw new Error(response?.error || "Unable to start blob download. Try Rescan and play the video first.");
  }

  await setCardStatus(card.id, {
    downloadMode: response.mode || "blob-source-copy"
  });
}

async function expandM3u8Candidates(candidates) {
  const expanded = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.url !== "string") {
      continue;
    }
    const detectedType = normalizeType(candidate.type || detectTypeFromUrl(candidate.url));
    if (detectedType !== "m3u8") {
      expanded.push(candidate);
      continue;
    }
    const fromMaster = await discoverMasterVariants(candidate);
    if (fromMaster.length > 0) {
      for (const variant of fromMaster) {
        expanded.push(variant);
      }
    } else {
      expanded.push(candidate);
    }
  }
  return expanded;
}

async function discoverMasterVariants(candidate) {
  const now = Date.now();
  const cached = m3u8MasterCache.get(candidate.url);
  if (cached && now - cached.cachedAt < M3U8_CACHE_TTL_MS) {
    return expandMasterOptions(candidate, cached.options, cached.baseUrl, simplifyUrlForMerge(candidate.url));
  }

  try {
    const fetched = await fetchPlaylist(candidate.url, { retries: 1, timeoutMs: 8000 });
    let text = fetched.text;
    let baseUrl = fetched.url;

    if (!/^#EXT-X-STREAM-INF/im.test(text)) {
      const guessed = await discoverMasterFromGuesses(candidate.url);
      // A neighboring master can describe a different video or a VOD beside a live feed.
      const matchesSource = guessed && parseMasterPlaylistModule(guessed.text, guessed.url).some((option) => normalizeDownloadHistoryUrl(option.url) === normalizeDownloadHistoryUrl(fetched.url));
      if (!matchesSource) {
        m3u8MasterCache.set(candidate.url, { cachedAt: now, options: [], baseUrl: candidate.url });
        return [];
      }
      text = guessed.text;
      baseUrl = guessed.url;
    }

    const options = parseMasterPlaylistModule(text, baseUrl).sort((a, b) => b.score - a.score);

    m3u8MasterCache.set(candidate.url, { cachedAt: now, options, baseUrl });
    if (m3u8MasterCache.size > 200) m3u8MasterCache.delete(m3u8MasterCache.keys().next().value);
    return expandMasterOptions(candidate, options, baseUrl, simplifyUrlForMerge(candidate.url));
  } catch {
    m3u8MasterCache.set(candidate.url, { cachedAt: now, options: [], baseUrl: candidate.url });
    return [];
  }
}

function buildMasterGuesses(rawUrl) {
  const guesses = [];
  try {
    const url = new URL(rawUrl);
    const originalPath = url.pathname;
    const mutators = [
      (path) => path.replace(/[^/]+\.m3u8$/i, "master.m3u8"),
      (path) => path.replace(/(?:_|-)(\d{3,4}p)(?=\.m3u8$)/i, "_master"),
      (path) => path.replace(/(?:_|-)(\d{3,4})x(\d{3,4})(?=\.m3u8$)/i, "_master"),
      (path) => path.replace(/\/(\d{3,4}p)\//i, "/master/"),
      (path) => path.replace(/\/(\d{3,4})x(\d{3,4})\//i, "/master/")
    ];
    for (const mutate of mutators) {
      const nextPath = mutate(originalPath);
      if (!nextPath || nextPath === originalPath) {
        continue;
      }
      const next = new URL(rawUrl);
      next.pathname = nextPath;
      guesses.push(next.href);
    }
  } catch {
    return [];
  }
  return [...new Set(guesses)].filter((url) => url !== rawUrl);
}

async function discoverMasterFromGuesses(rawUrl) {
  const guesses = buildMasterGuesses(rawUrl);
  for (const guess of guesses) {
    try {
      const text = await fetchText(guess);
      if (/^#EXT-X-STREAM-INF/im.test(text)) {
        return { url: guess, text };
      }
    } catch {
      // Ignore guess failure and continue.
    }
  }
  return null;
}

const downloadM3u8Variant = createHlsDownloader({ createCardDebugLog, getCardDebugLog, setCardStatus, buildFileName, activeDownloads });

async function fetchText(url) {
  return fetchTextWithRetry(url, { retries: 1, timeoutMs: 8000 });
}

async function ignoreCard(cardId) {
  await ensureInitialized();
  const card = state.cards[cardId];
  if (!card) {
    return;
  }
  card.ignored = true;
  card.updatedAt = Date.now();
  await persistState();
  broadcastStateUpdated();
}

async function resetBypass() {
  await ensureInitialized();
  let changed = false;
  for (const card of Object.values(state.cards)) {
    if (card.ignored) {
      card.ignored = false;
      card.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) {
    await persistState();
    broadcastStateUpdated();
  }
}

async function updateVariantSelection(cardId, variantId) {
  await ensureInitialized();
  const card = state.cards[cardId];
  if (!card) {
    return;
  }
  if (["downloading", "paused"].includes(card.status)) return;
  if (!card.variants.some((variant) => variant.id === variantId)) {
    return;
  }
  card.selectedVariantId = variantId;
  card.selectionLocked = true;
  card.updatedAt = Date.now();
  await persistState();
  broadcastStateUpdated();
}

async function clearAllCache(keepSettings) {
  await ensureInitialized();
  if (Object.values(state.cards).some((card) => ["queued", "downloading", "paused"].includes(card.status))) throw new Error("Wait for active downloads before clearing cache");
  const retainedSettings = keepSettings ? structuredClone(settings) : structuredClone(DEFAULT_SETTINGS);
  activeDownloads.clear();
  m3u8MasterCache.clear();
  dashDiscovery.clear();
  pageThumbnailCache.clear();
  tabMeta.clear();
  state = createEmptyState();
  downloadHistory = [];
  settings = retainedSettings;

  await stateWriter.flush();
  await collectTemporaryFiles(state.cards);

  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    [STATE_KEY]: state,
    [SETTINGS_KEY]: settings,
    [DOWNLOAD_HISTORY_KEY]: downloadHistory,
    vd_history_identity_version: 2
  });

  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // Ignore when CacheStorage is not available.
  }

  broadcastStateUpdated();
}

async function triggerRescan(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "RESCAN" });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function updateSettings(nextSettings) {
  await ensureInitialized();
  settings = cloneSettingsWithDefaults(nextSettings);
  downloadQueue.configure(settings.maxActiveDownloads);
  await persistSettings();

  let changed = false;
  for (const [cardId, card] of Object.entries(state.cards)) {
    if (retainDownloadTask(card)) continue;
    const beforeCount = card.variants.length;
    card.variants = card.variants.filter((variant) => shouldAcceptType(variant.type));

    if (card.variants.length === 0) {
      delete state.cards[cardId];
      changed = true;
      continue;
    }

    if (beforeCount !== card.variants.length) {
      changed = true;
    }

    if (!card.variants.some((variant) => variant.id === card.selectedVariantId)) {
      card.selectedVariantId = chooseBestVariant(card.variants).id;
      card.selectionLocked = false;
      changed = true;
    }
  }

  if (changed) {
    await persistState();
  }

  broadcastStateUpdated();
}

chrome.runtime.onInstalled.addListener(() => {
  ensureInitialized().catch(() => {});
});

chrome.runtime.onStartup?.addListener(() => {
  ensureInitialized().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (typeof changeInfo.url === "string" || typeof tab.url === "string" || typeof tab.title === "string") {
    if (typeof changeInfo.url === "string") {
      pageThumbnailCache.delete(tabId);
    }
    tabMeta.set(tabId, {
      url: typeof changeInfo.url === "string" ? changeInfo.url : tab.url || "",
      title: tab.title || ""
    });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ensureInitialized();
  tabMeta.delete(tabId);
  pageThumbnailCache.delete(tabId);
  if (settings.preserveOldPages) {
    return;
  }
  let changed = false;
  for (const [cardId, card] of Object.entries(state.cards)) {
    if (card.tabId === tabId && !retainDownloadTask(card)) {
      delete state.cards[cardId];
      changed = true;
    }
  }
  if (changed) {
    await persistState();
    broadcastStateUpdated();
  }
});

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    try {
      await ensureInitialized();
      if (!Number.isInteger(details.tabId) || details.tabId < 0) {
        return;
      }
      const meta = networkResponseMeta.get(details.url);
      const mime = (meta?.contentType || "").split(";")[0].trim().toLowerCase();
      const mimeType = ({ "application/vnd.apple.mpegurl": "m3u8", "application/x-mpegurl": "m3u8", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" })[mime];
      const type = mimeType || detectTypeFromUrl(details.url);
      if (!type || !shouldAcceptType(type)) {
        return;
      }
      if (!shouldAcceptNetworkCandidate(details.url, type, meta)) {
        return;
      }

      await ingestCandidates(
        [
          {
            url: details.url,
            type,
            source: "network",
            thumbnail: createDefaultThumbnail(type)
          }
        ],
        { tabId: details.tabId }
      );
    } catch {
      // Ignore webRequest failures.
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    cacheNetworkResponseMeta(details);
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.downloads.onChanged.addListener(createDownloadEventHandler({ getState: () => state, ensureInitialized, activeDownloads, buildDownloadAttemptList, setCardStatus, clamp, releaseRemuxUrl, getVariantById, isProbablyVideoDownloadItem, tryRemoveDownloadedFile, executeDownloadAttempts: executeReservedAttempts, getCardDebugLog, addDebugEntry, buildDebugReport, finalizeDebugLog, clearSegmentCheckpoint }));

let nativeEventQueue = Promise.resolve();
addNativePortListener((message) => {
  nativeEventQueue = nativeEventQueue.then(() => ensureInitialized()).then(() => handleNativePortMessage(message)).catch(console.error);
});

const handleRuntimeMessage = createRuntimeMessageHandler({
  ensureInitialized,
  getSettings: () => settings,
  getPublicState: (tabId, message) => message?.compact ? compactPublicState(getPublicState(tabId, message.all), message.versions) : getPublicState(tabId, message?.all),
  managementAction: async (message) => {
    switch (message.type) {
      case "NATIVE_HEALTH": return checkNativeHealth();
      case "RESCAN_ALL": {
        const tabs = await chrome.tabs.query({}); dashDiscovery.clear(); m3u8MasterCache.clear();
        const results = await Promise.all(tabs.filter((tab) => /^https?:/.test(tab.url || "") && getSitePolicy(settings, tab.url).detection).map((tab) => triggerRescan(tab.id)));
        return { scanned: results.filter(Boolean).length };
      }
      case "STORAGE_MANAGER": return storageManager(message.action || "stats", message.cardId);
      case "PRIORITIZE_TASK": downloadQueue.prioritize(message.cardId); return downloadQueue.snapshot;
      case "DISCOVERY_METRICS": return { dash: dashDiscovery.metrics, frames: Object.fromEntries(scanMetrics) };
      case "MEDIA_PREVIEW": { const card = state.cards[message.cardId]; if (!card) throw new Error("Card not found"); card.requestCredentials = getSitePolicy(settings, card.pageUrl).credentials ? "include" : "omit"; return previewMedia(card, getVariantById(card, message.variantId || card.selectedVariantId)); }
      case "HISTORY_LIST": return downloadHistory;
      case "RECOVER_SOURCE": {
        const card = state.cards[message.cardId]; if (!card) throw new Error("Card not found");
        dashDiscovery.clear(); m3u8MasterCache.clear();
        let tab; try { tab = await chrome.tabs.get(card.tabId); } catch { /* Closed source. */ }
        if (tab?.url === card.pageUrl) { await chrome.tabs.update(card.tabId, { active: true }); await triggerRescan(card.tabId); }
        else { if (!/^https?:/.test(card.pageUrl)) throw new Error("Source page URL unavailable"); await chrome.tabs.create({ url: card.pageUrl }); }
        return { rescan: true };
      }
      case "HISTORY_DELETE": downloadHistory = downloadHistory.filter((url) => url !== message.url); await persistDownloadHistory(); broadcastStateUpdated(); return downloadHistory;
      default: throw new Error("Unknown management action");
    }
  },
  downloadSubtitle: (cardId, uri) => downloadSubtitle(state.cards[cardId], uri, buildFileName),
  getQueueState: () => downloadQueue.snapshot,
  getSetupState: (forceRefresh) => setupReleaseController.getSetupState(forceRefresh),
  updateSettings,
  controlDownload,
  ingestCandidates,
  startDownload,
  updateVariantSelection,
  ignoreCard,
  resetBypass,
  triggerRescan,
  getCard: (cardId) => state.cards[cardId] || null,
  exportCardRecord,
  clearAllCache,
  setCardStatus
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target === "offscreen" || message?.type === "STATE_UPDATED") return false;
  (message?.type === "CAPTURE_PLAYER_VIEW" ? capturePlayerView(sender) : handleRuntimeMessage(message, sender))
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

const reservationFor = (variant, card) => variant?.isM3u8 || variant?.isBlob || variant?.type === "mpd" ? STREAM_RESERVATION : card?.requestCredentials === "omit" ? 64 * 1024 * 1024 : DIRECT_RESERVATION;
const downloadQueue = createDownloadQueue({ onEvent: (event, details) => addDebugEntry(getCardDebugLog(state.cards[details.id]), "info", "queue", event, details) });
const dashDiscovery = createDiscoveryCache();
const scanMetrics = new Map();
const storageManager = createStorageManager(() => state.cards);
const stateWriter = createStateWriter(() => chrome.storage.local.set({ [STATE_KEY]: structuredClone(state) }));
const progressMonitor = createDownloadProgressMonitor({ getCards: () => Object.values(state.cards), downloads: chrome.downloads, setCardStatus });
const downloadDashVariant = createDashDownloader({ createCardDebugLog, getCardDebugLog, setCardStatus, buildFileName, activeDownloads });
chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "temporary-cleanup") { await ensureInitialized(); console.debug("Temporary storage cleanup", await collectTemporaryFiles(state.cards)); }
});

async function executeReservedAttempts(cardId, attempts, index) {
  startingCards.add(cardId);
  try { await executeDownloadAttempts(cardId, attempts, index); }
  finally { startingCards.delete(cardId); if (state.cards[cardId]?.status !== "downloading") downloadQueue.release(cardId); }
}
