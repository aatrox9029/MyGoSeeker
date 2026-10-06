const STATE_KEY = "vd_state_v1";
const SETTINGS_KEY = "vd_settings_v1";
const DOWNLOAD_HISTORY_KEY = "vd_download_history_v1";

const VIDEO_TYPES = ["mp4", "webm", "m3u8", "blob", "mov", "m4v", "mkv", "avi", "flv", "mpeg"];

const DEFAULT_SETTINGS = {
  locale: "en",
  enabledTypes: {
    mp4: true,
    webm: true,
    m3u8: true,
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

function createEmptyState() {
  return {
    cards: {},
    updatedAt: Date.now()
  };
}

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

function normalizeStoredState(input) {
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

function normalizeVariant(variant) {
  if (!variant || typeof variant !== "object" || typeof variant.url !== "string") {
    return null;
  }
  const type = normalizeType(variant.type || detectTypeFromUrl(variant.url));
  if (!type) {
    return null;
  }
  return {
    id: typeof variant.id === "string" ? variant.id : `variant_${hashString(variant.url)}`,
    url: variant.url,
    audioUrl: typeof variant.audioUrl === "string" ? variant.audioUrl : "",
    masterUrl: typeof variant.masterUrl === "string" ? variant.masterUrl : "",
    type,
    methodFamily: normalizeMethodFamily(variant.methodFamily),
    source: typeof variant.source === "string" ? variant.source : "unknown",
    label: typeof variant.label === "string" ? variant.label : buildVariantLabel(variant.url, type),
    score: Number.isFinite(variant.score) ? variant.score : computeQualityScore(variant.url, type),
    isBlob: type === "blob",
    isM3u8: type === "m3u8",
    detectedAt: Number.isFinite(variant.detectedAt) ? variant.detectedAt : Date.now()
  };
}

function ensureVariantMethodCoverage(variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return { variants: [], changed: false };
  }
  const result = [];
  const seenBlobKeys = new Set();
  let changed = false;

  for (const variant of variants) {
    if (!variant) {
      continue;
    }
    if (variant.type === "blob") {
      const blobKey = `${variant.url}|${variant.type}|${variant.source || "unknown"}`;
      if (seenBlobKeys.has(blobKey)) {
        changed = true;
        continue;
      }
      seenBlobKeys.add(blobKey);
      const families = ["network", "record"];
      for (const methodFamily of families) {
        const nextVariant = {
          ...variant,
          id: `variant_${hashString(`${blobKey}|${methodFamily}`)}`,
          methodFamily
        };
        result.push(nextVariant);
      }
      const blobFamilyCount = variants.filter((item) => item?.type === "blob" && `${item.url}|${item.type}|${item.source || "unknown"}` === blobKey).length;
      if (blobFamilyCount !== 2 || !variants.some((item) => item?.type === "blob" && item?.methodFamily === "record" && `${item.url}|${item.type}|${item.source || "unknown"}` === blobKey)) {
        changed = true;
      }
      continue;
    }
    const nextFamily = normalizeMethodFamily(variant.methodFamily);
    if (nextFamily !== variant.methodFamily) {
      changed = true;
    }
    result.push({
      ...variant,
      methodFamily: nextFamily
    });
  }

  return { variants: result, changed };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  const stored = await chrome.storage.local.get([STATE_KEY, SETTINGS_KEY, DOWNLOAD_HISTORY_KEY]);
  settings = cloneSettingsWithDefaults(stored[SETTINGS_KEY]);
  state = normalizeStoredState(stored[STATE_KEY]);
  downloadHistory = normalizeDownloadHistoryEntries(stored[DOWNLOAD_HISTORY_KEY]);
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
  if (migrated) {
    await persistState();
  }
  initialized = true;
}

async function persistState() {
  state.updatedAt = Date.now();
  await chrome.storage.local.set({ [STATE_KEY]: state });
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

function broadcastStateUpdated() {
  chrome.runtime.sendMessage({ type: "STATE_UPDATED" }).catch(() => {});
}

function normalizeType(type) {
  if (!type || typeof type !== "string") {
    return "";
  }
  const lower = type.toLowerCase();
  if (lower === "mpg") {
    return "mpeg";
  }
  if (VIDEO_TYPES.includes(lower)) {
    return lower;
  }
  return "";
}

function detectTypeFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }
  if (rawUrl.startsWith("blob:")) {
    return "blob";
  }
  const lower = rawUrl.toLowerCase();
  if (lower.includes(".m3u8")) {
    return "m3u8";
  }
  if (lower.includes(".webm")) {
    return "webm";
  }
  if (lower.includes(".mp4")) {
    return "mp4";
  }
  if (lower.includes(".mov")) {
    return "mov";
  }
  if (lower.includes(".m4v")) {
    return "m4v";
  }
  if (lower.includes(".mkv")) {
    return "mkv";
  }
  if (lower.includes(".avi")) {
    return "avi";
  }
  if (lower.includes(".flv")) {
    return "flv";
  }
  if (lower.includes(".mpeg") || lower.includes(".mpg")) {
    return "mpeg";
  }

  try {
    const url = new URL(rawUrl);
    const ext = url.pathname.split(".").pop()?.toLowerCase() || "";
    return normalizeType(ext);
  } catch {
    return "";
  }
}

function extractResolution(rawUrl) {
  if (!rawUrl) {
    return 0;
  }
  const dimensionMatch = rawUrl.match(/(?:^|[^\d])(\d{3,4})[x*](\d{3,4})(?:[^\d]|$)/i);
  if (dimensionMatch) {
    return Number(dimensionMatch[2]) || 0;
  }
  const match = rawUrl.match(/(?:^|[^\d])(2160|1440|1080|720|540|480|360|240)p?(?:[^\d]|$)/i);
  if (match) {
    return Number(match[1]);
  }
  return 0;
}

function extractDimensions(rawUrl) {
  if (!rawUrl) {
    return { width: 0, height: 0 };
  }
  const match = rawUrl.match(/(?:^|[^\d])(\d{3,4})[x*](\d{3,4})(?:[^\d]|$)/i);
  if (!match) {
    return { width: 0, height: 0 };
  }
  return {
    width: Number(match[1]) || 0,
    height: Number(match[2]) || 0
  };
}

function extractBitrate(rawUrl) {
  if (!rawUrl) {
    return 0;
  }
  const match = rawUrl.match(/(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i);
  if (match) {
    return Number(match[1]);
  }
  return 0;
}

function computeQualityScore(rawUrl, type) {
  const dims = extractDimensions(rawUrl);
  const resolution = type === "m3u8"
    ? (dims.height || 0)
    : extractResolution(rawUrl);
  const bitrate = extractBitrate(rawUrl);
  const m3u8Boost = type === "m3u8" ? 0.001 : 0;
  return resolution * 10000 + dims.width + bitrate / 10 + m3u8Boost;
}

function buildVariantLabel(rawUrl, type) {
  const dims = extractDimensions(rawUrl);
  const resolution = type === "m3u8"
    ? 0
    : extractResolution(rawUrl);
  const bitrate = extractBitrate(rawUrl);
  const parts = [];
  if (dims.width && dims.height) {
    parts.push(`${dims.width}*${dims.height}`);
  } else if (resolution) {
    parts.push(`${resolution}p`);
  } else if (type === "m3u8") {
    parts.push("Auto");
  }
  if (bitrate) {
    parts.push(`${bitrate}k`);
  }
  if (parts.length === 0) {
    parts.push(type.toUpperCase());
  }
  return `${parts.join(" ")} (${type})`;
}

function isPlaceholderThumbnail(thumbnail) {
  return typeof thumbnail === "string" && thumbnail.startsWith("data:image/svg+xml;base64,");
}

function shouldReplaceThumbnail(currentThumbnail, nextThumbnail) {
  if (!nextThumbnail || typeof nextThumbnail !== "string") {
    return false;
  }
  if (!currentThumbnail || typeof currentThumbnail !== "string") {
    return true;
  }
  const currentPlaceholder = isPlaceholderThumbnail(currentThumbnail);
  const nextPlaceholder = isPlaceholderThumbnail(nextThumbnail);
  if (currentPlaceholder && !nextPlaceholder) {
    return true;
  }
  if (!currentPlaceholder && nextPlaceholder) {
    return false;
  }
  return currentPlaceholder && nextPlaceholder && currentThumbnail !== nextThumbnail;
}

function normalizeUrlForVariantKey(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.href;
  } catch {
    return rawUrl.split("?")[0].toLowerCase();
  }
}

function extractResolutionFromLabel(label) {
  if (!label || typeof label !== "string") {
    return { width: 0, height: 0 };
  }
  const dims = label.match(/(\d{3,4})[x*](\d{3,4})/i);
  if (dims) {
    return {
      width: Number(dims[1]) || 0,
      height: Number(dims[2]) || 0
    };
  }
  const heightOnly = label.match(/(?:^|[^\d])(\d{3,4})p(?:[^\d]|$)/i);
  if (heightOnly) {
    return {
      width: 0,
      height: Number(heightOnly[1]) || 0
    };
  }
  return { width: 0, height: 0 };
}

function extractBitrateFromLabel(label) {
  if (!label || typeof label !== "string") {
    return 0;
  }
  const match = label.match(/(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i);
  if (!match) {
    return 0;
  }
  return Number(match[1]) || 0;
}

function buildVariantSimilarityKey(variant) {
  const baseType = normalizeType(variant.type);
  const methodFamily = getVariantMethodFamily(variant);
  const urlKey = normalizeUrlForVariantKey(variant.url);
  const labelDims = extractResolutionFromLabel(variant.label);
  const urlDims = extractDimensions(variant.url);
  const width = labelDims.width || urlDims.width || 0;
  const height = labelDims.height || urlDims.height || extractResolution(variant.url) || 0;
  const labelBitrate = extractBitrateFromLabel(variant.label);
  const urlBitrate = extractBitrate(variant.url);
  const bitrate = labelBitrate || urlBitrate || 0;
  const bitrateBucket = bitrate > 0 ? Math.round(bitrate / 100) * 100 : 0;
  const qualityEdge = width && height ? Math.min(width, height) : height;

  if (qualityEdge) {
    return `${baseType}|${methodFamily}|${urlKey}|edge:${qualityEdge}|bitrate:${bitrateBucket || 0}`;
  }
  if (bitrateBucket) {
    return `${baseType}|${methodFamily}|${urlKey}|bitrate:${bitrateBucket}`;
  }
  return `${baseType}|${methodFamily}|${urlKey}`;
}

function variantLabelDetailScore(variant) {
  let score = 0;
  const label = typeof variant.label === "string" ? variant.label : "";
  if (/(\d{3,4})[x*](\d{3,4})/i.test(label)) {
    score += 3;
  } else if (/(?:^|[^\d])(\d{3,4})p(?:[^\d]|$)/i.test(label)) {
    score += 2;
  }
  if (/(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i.test(label)) {
    score += 2;
  }
  if (typeof variant.source === "string" && variant.source.includes(":master")) {
    score += 1;
  }
  return score;
}

function getSourceStabilityScore(variant) {
  let score = 0;
  const source = typeof variant?.source === "string" ? variant.source.toLowerCase() : "";
  const url = typeof variant?.url === "string" ? variant.url : "";

  if (url.startsWith("https://")) {
    score += 8;
  }
  if (source.includes("master")) {
    score += 14;
  }
  if (source.includes("network")) {
    score += 10;
  }
  if (source.includes("dom")) {
    score += 6;
  }
  if (source.includes("unknown")) {
    score += 2;
  }
  if (variant?.isBlob) {
    score -= 6;
  }
  return score;
}

function variantInfoCompletenessRank(variant) {
  const label = typeof variant.label === "string" ? variant.label : "";
  const url = typeof variant.url === "string" ? variant.url : "";
  const labelDims = extractResolutionFromLabel(label);
  const urlDims = extractDimensions(url);
  const hasResolution = Boolean(labelDims.height || urlDims.height || extractResolution(url));
  const hasBitrate = Boolean(extractBitrateFromLabel(label) || extractBitrate(url));
  if (hasResolution && hasBitrate) {
    return 2;
  }
  if (hasResolution || hasBitrate) {
    return 1;
  }
  return 0;
}

function choosePreferredVariant(existing, incoming) {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }
  const existingCompleteness = variantInfoCompletenessRank(existing);
  const incomingCompleteness = variantInfoCompletenessRank(incoming);
  if (incomingCompleteness !== existingCompleteness) {
    return incomingCompleteness > existingCompleteness ? incoming : existing;
  }
  const existingDetail = variantLabelDetailScore(existing);
  const incomingDetail = variantLabelDetailScore(incoming);
  if (incomingDetail !== existingDetail) {
    return incomingDetail > existingDetail ? incoming : existing;
  }
  const existingStability = getSourceStabilityScore(existing);
  const incomingStability = getSourceStabilityScore(incoming);
  if (incomingStability !== existingStability) {
    return incomingStability > existingStability ? incoming : existing;
  }
  if (incoming.score !== existing.score) {
    return incoming.score > existing.score ? incoming : existing;
  }
  return incoming.detectedAt > existing.detectedAt ? incoming : existing;
}

function shouldReplaceVariantLabel(currentLabel, nextLabel) {
  if (!nextLabel || typeof nextLabel !== "string") {
    return false;
  }
  if (!currentLabel || typeof currentLabel !== "string") {
    return true;
  }
  const currentDetail = variantLabelDetailScore({ label: currentLabel, source: "" });
  const nextDetail = variantLabelDetailScore({ label: nextLabel, source: "" });
  if (nextDetail !== currentDetail) {
    return nextDetail > currentDetail;
  }
  const currentCompleteness = variantInfoCompletenessRank({ label: currentLabel, url: "" });
  const nextCompleteness = variantInfoCompletenessRank({ label: nextLabel, url: "" });
  if (nextCompleteness !== currentCompleteness) {
    return nextCompleteness > currentCompleteness;
  }
  return false;
}

function dedupeVariantsBySimilarity(variants) {
  const result = [];
  const keyToIndex = new Map();
  let changed = false;

  for (const variant of variants) {
    const key = buildVariantSimilarityKey(variant);
    if (!keyToIndex.has(key)) {
      keyToIndex.set(key, result.length);
      result.push(variant);
      continue;
    }
    const index = keyToIndex.get(key);
    const kept = result[index];
    const preferred = choosePreferredVariant(kept, variant);
    if (preferred !== kept) {
      result[index] = preferred;
    }
    changed = true;
  }

  return { variants: result, changed: changed || result.length !== variants.length };
}

function chooseBestVariant(variants) {
  return [...variants].sort((a, b) => {
    if (a.isBlob !== b.isBlob) {
      return a.isBlob ? 1 : -1;
    }
    const aCompleteness = variantInfoCompletenessRank(a);
    const bCompleteness = variantInfoCompletenessRank(b);
    if (aCompleteness !== bCompleteness) {
      return bCompleteness - aCompleteness;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const aStability = getSourceStabilityScore(a);
    const bStability = getSourceStabilityScore(b);
    if (aStability !== bStability) {
      return bStability - aStability;
    }
    if (a.isM3u8 !== b.isM3u8) {
      return a.isM3u8 ? -1 : 1;
    }
    return b.detectedAt - a.detectedAt;
  })[0];
}

function reconcileCardSelection(card) {
  if (!card || !Array.isArray(card.variants) || card.variants.length === 0) {
    return false;
  }
  if (card.status === "downloading") return false;
  const selectedStillExists = card.variants.some((variant) => variant.id === card.selectedVariantId);
  if (card.selectedVariantId && selectedStillExists && card.selectionLocked) {
    return false;
  }
  const bestVariant = chooseBestVariant(card.variants);
  if (!bestVariant || card.selectedVariantId === bestVariant.id) {
    return false;
  }
  card.selectedVariantId = bestVariant.id;
  return true;
}

function getVariantById(card, variantId) {
  if (!card || !Array.isArray(card.variants)) {
    return null;
  }
  return card.variants.find((variant) => variant.id === variantId) || null;
}

function getFileExtensionFromName(name) {
  if (!name || typeof name !== "string") {
    return "";
  }
  const clean = name.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return clean.slice(dot + 1).toLowerCase();
}

function isVideoFileExtension(ext) {
  return VIDEO_FILE_EXTENSIONS.has(ext);
}

function isNonVideoMime(mime) {
  if (!mime) {
    return false;
  }
  const lower = mime.toLowerCase();
  if (lower.startsWith("video/")) {
    return false;
  }
  return lower.startsWith("text/")
    || lower.includes("html")
    || lower.includes("json")
    || lower.includes("xml")
    || lower.includes("javascript");
}

function getHeaderValue(headers, name) {
  if (!Array.isArray(headers)) {
    return "";
  }
  const target = String(name || "").toLowerCase();
  const entry = headers.find((item) => String(item?.name || "").toLowerCase() === target);
  return typeof entry?.value === "string" ? entry.value : "";
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

function shouldAcceptNetworkCandidate(url, detectedType, meta) {
  if (!url || !detectedType) {
    return false;
  }
  if (detectedType === "m3u8") {
    return true;
  }
  if (!meta || typeof meta !== "object") {
    return false;
  }
  if (Number.isInteger(meta.statusCode) && meta.statusCode >= 400) {
    return false;
  }

  const requestType = String(meta.requestType || "").toLowerCase();
  if (["image", "script", "stylesheet", "font", "ping", "csp_report", "imageset", "sub_frame", "main_frame"].includes(requestType)) {
    return false;
  }

  const contentType = String(meta.contentType || "").toLowerCase();
  if (contentType) {
    if (contentType.startsWith("video/")) {
      return true;
    }
    if (contentType.includes("application/octet-stream")) {
      return true;
    }
    if (isNonVideoMime(contentType) || contentType.startsWith("image/")) {
      return false;
    }
  }

  const disposition = String(meta.contentDisposition || "").toLowerCase();
  if (disposition.includes("attachment")) {
    return true;
  }

  return requestType === "media" || requestType === "object";
}

function getVariantAttemptPriority(variant) {
  let priority = 0;
  if (variant.isBlob) {
    priority -= 10000;
  }
  priority += (Number.isFinite(variant.score) ? variant.score : 0) * 10;
  priority += variantInfoCompletenessRank(variant) * 1000;
  priority += getSourceStabilityScore(variant) * 100;
  if (variant.isM3u8) {
    priority += 80;
  }
  if (getVariantMethodFamily(variant) === "record") {
    priority -= 5000;
  }
  return priority;
}

function buildDownloadAttemptList(card, preferredVariantId) {
  if (!card || !Array.isArray(card.variants) || card.variants.length === 0) {
    return [];
  }
  const preferred = getVariantById(card, preferredVariantId) || chooseBestVariant(card.variants);
  if (!preferred) {
    return [];
  }
  const preferredFamily = getVariantMethodFamily(preferred);

  const preferredKey = buildVariantSimilarityKey(preferred);
  const sameQuality = card.variants
    .filter((variant) => {
      return variant.id !== preferred.id
        && getVariantMethodFamily(variant) === preferredFamily
        && buildVariantSimilarityKey(variant) === preferredKey;
    })
    .sort((a, b) => getVariantAttemptPriority(b) - getVariantAttemptPriority(a));

  const remaining = card.variants
    .filter((variant) => {
      return variant.id !== preferred.id
        && getVariantMethodFamily(variant) === preferredFamily
        && buildVariantSimilarityKey(variant) !== preferredKey;
    })
    .sort((a, b) => getVariantAttemptPriority(b) - getVariantAttemptPriority(a));

  return [preferred.id, ...sameQuality.map((variant) => variant.id), ...remaining.map((variant) => variant.id)];
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

function isProbablyVideoDownloadItem(item, attemptedVariant) {
  if (!item || item.fileSize === 0 || item.exists === false) {
    return false;
  }
  if (attemptedVariant?.isBlob || attemptedVariant?.isM3u8) {
    return true;
  }

  const mime = typeof item.mime === "string" ? item.mime : "";
  if (isNonVideoMime(mime)) {
    return false;
  }
  if (mime.toLowerCase().startsWith("video/")) {
    return true;
  }

  const extFromFilename = getFileExtensionFromName(item.filename || "");
  if (extFromFilename) {
    return isVideoFileExtension(extFromFilename);
  }
  const extFromFinalUrl = getFileExtensionFromName(item.finalUrl || item.url || "");
  if (extFromFinalUrl) {
    return isVideoFileExtension(extFromFinalUrl);
  }
  return true;
}

function simplifyUrlForMerge(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }
  if (rawUrl.startsWith("blob:")) {
    return rawUrl;
  }
  try {
    const url = new URL(rawUrl);
    let path = url.pathname.toLowerCase();
    path = path.replace(/\/\d{2,5}x\d{2,5}(?=\/)/g, "");
    path = path.replace(/\/(2160|1440|1080|720|540|480|360|240)p(?=\/)/g, "");
    path = path.replace(/(?:^|[_\-\.])(2160|1440|1080|720|540|480|360|240)p?(?=[_\-\.]|$)/g, "");
    path = path.replace(/(?:^|[_\-\.])(low|mid|high|hd|fhd|uhd)(?=[_\-\.]|$)/g, "");
    path = path.replace(/(?:^|[_\-\.])\d{3,5}k(?=[_\-\.]|$)/g, "");
    path = path.replace(/\.(mp4|webm|m3u8|mov|m4v|mkv|avi|flv|mpeg|mpg)$/g, "");
    path = path.replace(/\/{2,}/g, "/");
    return `${url.origin}${path}`;
  } catch {
    return rawUrl.split("?")[0].toLowerCase();
  }
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function deriveCardTitle(candidate, pageTitle) {
  if (candidate.title) {
    return candidate.title;
  }
  if (pageTitle) {
    return pageTitle;
  }
  try {
    const url = new URL(candidate.url);
    const file = url.pathname.split("/").pop();
    if (file) {
      return decodeURIComponent(file);
    }
    return `${url.hostname} video`;
  } catch {
    return "Video";
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

async function requestPageThumbnail(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) {
    return "";
  }
  const cached = pageThumbnailCache.get(tabId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < PAGE_THUMB_CACHE_TTL_MS) {
    return cached.thumbnail || "";
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_THUMBNAIL" });
    const thumbnail = response?.ok && typeof response.thumbnail === "string" ? response.thumbnail : "";
    pageThumbnailCache.set(tabId, {
      thumbnail,
      cachedAt: now
    });
    return thumbnail;
  } catch {
    pageThumbnailCache.set(tabId, { thumbnail: "", cachedAt: now });
    return "";
  }
}

function normalizeTitleForGrouping(title) {
  if (!title || typeof title !== "string") {
    return "";
  }
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeCardsBySameTitle(tabId, pageUrl) {
  if (!pageUrl) {
    return false;
  }
  const candidates = Object.values(state.cards).filter((card) => {
    return card.tabId === tabId
      && card.pageUrl === pageUrl
      && !card.ignored
      && !retainDownloadTask(card)
      && Array.isArray(card.variants)
      && card.variants.length > 0;
  });
  if (candidates.length < 2) {
    return false;
  }

  const groups = new Map();
  for (const card of candidates) {
    const titleKey = normalizeTitleForGrouping(card.title || card.pageTitle || "");
    if (!titleKey) {
      continue;
    }
    if (card.identityKey) {
      continue;
    }
    const key = `${tabId}|${pageUrl}|${card.mediaKey || ""}|${titleKey}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(card);
  }

  let changed = false;
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    group.sort((a, b) => b.updatedAt - a.updatedAt);
    const primary = group[0];
    const others = group.slice(1);

    for (const secondary of others) {
      for (const variant of secondary.variants) {
        if (!primary.variants.some((item) => item.id === variant.id)) {
          primary.variants.push(variant);
        }
      }
      if (shouldReplaceThumbnail(primary.thumbnail, secondary.thumbnail)) {
        primary.thumbnail = secondary.thumbnail;
      }
      delete state.cards[secondary.id];
      changed = true;
    }

    const deduped = dedupeVariantsBySimilarity(primary.variants);
    if (deduped.changed) {
      primary.variants = deduped.variants;
      changed = true;
    }
    if (reconcileCardSelection(primary)) {
      changed = true;
    }
    primary.updatedAt = Date.now();
  }
  return changed;
}

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

  cleanupForNonPreserve(tabId, pageUrl);

  let changed = false;
  const expandedCandidates = await expandM3u8Candidates(candidates);
  let tabThumbnailRequested = false;
  let tabThumbnail = "";
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
        tabId,
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
    if (shouldReplaceThumbnail(card.thumbnail, rawCandidate.thumbnail)) {
      card.thumbnail = rawCandidate.thumbnail;
      changed = true;
    }
    if (
      detectedType === "m3u8" &&
      (!card.thumbnail || isPlaceholderThumbnail(card.thumbnail))
    ) {
      if (!tabThumbnailRequested) {
        tabThumbnailRequested = true;
        tabThumbnail = await requestPageThumbnail(tabId);
      }
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
        for (const key of ["audioUrl", "masterUrl"]) {
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

function getPublicState(activeTabId) {
  const filtered = getVisibleCards(Object.values(state.cards), activeTabId, settings);

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
  let historyChanged = false;
  if (card.status === "completed" && Number.isFinite(patch.completedAt)) {
    const selectedVariant = getVariantById(card, card.selectedVariantId);
    const nextHistory = recordDownloadedUrl(downloadHistory, selectedVariant?.url || "");
    historyChanged = nextHistory.length !== downloadHistory.length;
    downloadHistory = nextHistory;
  }
  card.updatedAt = Date.now();
  if (historyChanged) {
    await persistDownloadHistory();
  }
  await persistState();
  broadcastStateUpdated();
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

function sanitizeFileName(input) {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "video";
}

function getExtensionFromType(type) {
  const normalized = normalizeType(type);
  if (normalized === "m3u8") {
    return "mp4";
  }
  if (normalized === "mpeg") {
    return "mpeg";
  }
  if (normalized) {
    return normalized;
  }
  return "mp4";
}

function buildFileName(card, variant, overrideExt) {
  const base = sanitizeFileName(card.title || "video");
  const ext = overrideExt || getExtensionFromType(variant.type);
  return `${base}.${ext}`;
}

async function startNativeVariant(card, variant) {
  const requestContext = await collectRequestContext({ card, variant });
  const nativeJob = buildNativeJob({
    card: {
      ...card,
      title: sanitizeFileName(card.title || "video")
    },
    variant,
    requestContext
  });

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
  isNativeHostConnected
});

async function fallbackNativeDownload(card, message) {
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
    if (reasonLabel !== "extension-fallback" && shouldUseNativeDownload(variant)) {
      try {
        await ensureNativePort();
        await startNativeVariant(card, variant);
        return { ok: true, pending: true };
      } catch (nativeError) {
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
    if (variant.isM3u8) {
      await downloadM3u8Variant(card, variant);
      return { ok: true, pending: true };
    }

    await downloadDirectVariant(card, variant, {
      reasonLabel
    });
    return { ok: true, pending: true };
  } catch (error) {
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

async function startDownload(cardId, variantId) {
  await ensureInitialized();
  const card = state.cards[cardId];
  if (!card) {
    throw new Error("Card not found");
  }
  const variant = card.variants.find((item) => item.id === variantId) || card.variants.find((item) => item.id === card.selectedVariantId);
  if (!variant) {
    throw new Error("Variant not found");
  }
  if (startingCards.has(cardId) || card.status === "downloading") throw new Error("Download already in progress");
  startingCards.add(cardId);
  try {
    createCardDebugLog(card, variant);
    const attempts = buildDownloadAttemptList(card, variant.id);
    await executeDownloadAttempts(card.id, attempts, 0);
  } finally { startingCards.delete(cardId); }
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
  const downloadId = await startDirectBrowserDownload(chrome.downloads, {
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
    attemptQueue: Array.isArray(context?.attemptQueue) ? [...context.attemptQueue] : [variant.id],
    attemptIndex: Number.isInteger(context?.attemptIndex) ? context.attemptIndex : 0
  });

  await setCardStatus(card.id, {
    status: "downloading",
    progress: 5,
    stage: "Browser download started",
    downloadMode: "direct-copy",
    activeDownloadId: downloadId,
    error: ""
  });
}

async function downloadBlobVariant(card, variant) {
  const filenameBase = sanitizeFileName(card.title || "video");
  const response = await requestBlobDownload(card.tabId, {
    cardId: card.id,
    blobUrl: variant.url,
    filenameBase,
    methodFamily: getVariantMethodFamily(variant)
  });

  if (!response || response.ok !== true) {
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
      if (!guessed) {
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
  if (card.status === "downloading") return;
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
  if (Object.values(state.cards).some((card) => card.status === "downloading")) throw new Error("Wait for active downloads before clearing cache");
  const retainedSettings = keepSettings ? structuredClone(settings) : structuredClone(DEFAULT_SETTINGS);
  activeDownloads.clear();
  m3u8MasterCache.clear();
  pageThumbnailCache.clear();
  tabMeta.clear();
  state = createEmptyState();
  downloadHistory = [];
  settings = retainedSettings;

  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    [STATE_KEY]: state,
    [SETTINGS_KEY]: settings,
    [DOWNLOAD_HISTORY_KEY]: downloadHistory
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

chrome.downloads.onChanged.addListener(async (delta) => {
  await ensureInitialized();
  let entry = activeDownloads.get(delta.id);
  if (!entry) {
    const card = Object.values(state.cards).find((item) => item.activeDownloadId === delta.id);
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

  if (delta.totalBytes?.current) {
    entry.totalBytes = delta.totalBytes.current;
  }

  if (delta.bytesReceived?.current && entry.totalBytes > 0) {
    const progress = clamp((delta.bytesReceived.current / entry.totalBytes) * 100, 0, 99);
    await setCardStatus(entry.cardId, {
      status: "downloading",
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
    const card = state.cards[entry.cardId];
    const attemptedVariant = card ? getVariantById(card, entry.variantId) : null;
    const isVideo = isProbablyVideoDownloadItem(item, attemptedVariant);
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
});

let nativeEventQueue = Promise.resolve();
addNativePortListener((message) => {
  nativeEventQueue = nativeEventQueue.then(() => ensureInitialized()).then(() => handleNativePortMessage(message)).catch(console.error);
});

const handleRuntimeMessage = createRuntimeMessageHandler({
  ensureInitialized,
  getSettings: () => settings,
  getPublicState,
  getSetupState: (forceRefresh) => setupReleaseController.getSetupState(forceRefresh),
  updateSettings,
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
  handleRuntimeMessage(message, sender)
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});
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
