const SCAN_DEBOUNCE_MS = 1000;
const MAX_REASONABLE_DURATION_SECONDS = 12 * 60 * 60;
const TRANSFER_CHUNK_BYTES = 64 * 1024;
let scanTimer = null;
const binaryTransfers = new Map();
let lastDiscoverySignature = "";
let lastDiscoverySentAt = 0;
let scanning = false;
const discoveryMetrics = { scans: 0, skipped: 0, elapsedMs: 0 };
let sitePolicy = { detection: true }, sitePolicyCheckedAt = 0;

function detectTypeFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }
  if (rawUrl.startsWith("blob:")) {
    return "blob";
  }
  const lower = rawUrl.toLowerCase();
  if (lower.includes(".mpd")) return "mpd";
  if (lower.includes(".m3u8")) return "m3u8";
  if (lower.includes(".mp4")) return "mp4";
  if (lower.includes(".webm")) return "webm";
  if (lower.includes(".mov")) return "mov";
  if (lower.includes(".m4v")) return "m4v";
  if (lower.includes(".mkv")) return "mkv";
  if (lower.includes(".avi")) return "avi";
  if (lower.includes(".flv")) return "flv";
  if (lower.includes(".mpeg") || lower.includes(".mpg")) return "mpeg";
  return "";
}

function absoluteUrl(url) {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

function formatDimensions(width, height) {
  if (!width || !height) {
    return "";
  }
  return `${width}*${height}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function getRangeDuration(rangeList) {
  if (!rangeList || typeof rangeList.length !== "number" || rangeList.length === 0) {
    return 0;
  }
  const lastIndex = rangeList.length - 1;
  try {
    const end = Number(rangeList.end(lastIndex));
    const start = Number(rangeList.start(0));
    if (Number.isFinite(end) && Number.isFinite(start) && end > start) {
      return end - start;
    }
  } catch {
    return 0;
  }
  return 0;
}

function getFallbackDurationEstimate(video) {
  const candidates = [
    getRangeDuration(video.seekable),
    getRangeDuration(video.buffered),
    getRangeDuration(video.played)
  ].filter((value) => Number.isFinite(value) && value > 0 && value <= MAX_REASONABLE_DURATION_SECONDS);

  if (candidates.length > 0) {
    return Math.max(...candidates);
  }
  return 0;
}

function resolveEffectiveDuration(video) {
  const rawDuration = Number.isFinite(video.duration) ? Number(video.duration) : 0;
  if (rawDuration > 0 && rawDuration <= MAX_REASONABLE_DURATION_SECONDS) {
    return { duration: rawDuration, usedFallback: false };
  }
  if (rawDuration > MAX_REASONABLE_DURATION_SECONDS) {
    const fallback = getFallbackDurationEstimate(video);
    const duration = fallback > 0 ? fallback : MAX_REASONABLE_DURATION_SECONDS;
    return { duration, usedFallback: true };
  }
  return { duration: rawDuration > 0 ? rawDuration : 0, usedFallback: false };
}

function createPlaceholderThumbnail(type) {
  const bg = type === "m3u8" ? "#ffd166" : "#8ecae6";
  const label = (type || "video").toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='320' height='180' fill='${bg}'/><text x='50%' y='50%' font-size='34' text-anchor='middle' fill='#0f172a' dominant-baseline='middle' font-family='sans-serif'>${label}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function extractBitrate(url) {
  if (!url || typeof url !== "string") {
    return 0;
  }
  const match = url.match(/(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i);
  return match ? Number(match[1]) || 0 : 0;
}

function buildCandidateLabel(video, detectedType, url) {
  const parts = [];
  if (video?.videoWidth && video?.videoHeight) {
    parts.push(formatDimensions(video.videoWidth, video.videoHeight));
  }
  const bitrate = extractBitrate(url);
  if (bitrate) {
    parts.push(`${bitrate}k`);
  }
  if (parts.length === 0) {
    parts.push(detectedType.toUpperCase());
  }
  return `${parts.join(" ")} (${detectedType})`;
}

function getCandidateUrlsFromVideo(video) {
  const results = new Set();
  if (video.currentSrc) {
    results.add(absoluteUrl(video.currentSrc));
  }
  if (video.src) {
    results.add(absoluteUrl(video.src));
  }

  const sourceElements = video.querySelectorAll("source[src]");
  for (const source of sourceElements) {
    if (source.src) {
      results.add(absoluteUrl(source.src));
    }
  }

  return [...results];
}

function guessTitle(video) {
  const attrTitle = video.getAttribute("title") || video.getAttribute("aria-label") || "";
  if (attrTitle) {
    return attrTitle.trim();
  }
  const container = video.closest("figure, article, section, div");
  const heading = container?.querySelector("h1,h2,h3,h4");
  if (heading?.textContent) {
    return heading.textContent.trim();
  }
  return document.title || "Video";
}

function buildVideoIdentityKey(video, index) {
  if (!video) {
    return `video:${index}`;
  }
  const parts = [`video:${index}`];
  if (video.id) {
    parts.push(`id:${video.id}`);
  }
  if (video.getAttribute("data-testid")) {
    parts.push(`testid:${video.getAttribute("data-testid")}`);
  }
  if (video.getAttribute("aria-label")) {
    parts.push(`aria:${video.getAttribute("aria-label")}`);
  }
  const ancestors = [];
  let node = video;
  while (node && node !== document.body && ancestors.length < 4) {
    const parent = node.parentElement;
    if (!parent) {
      break;
    }
    const tag = parent.tagName.toLowerCase();
    const siblingIndex = [...parent.children].indexOf(node);
    ancestors.unshift(`${tag}:${siblingIndex}`);
    node = parent;
  }
  if (ancestors.length > 0) {
    parts.push(ancestors.join(">"));
  }
  return parts.join("|");
}

async function collectDomCandidates() {
  const videos = discoverVideoElements();
  const candidates = [];

  for (const [index, video] of videos.entries()) {
    const urls = getCandidateUrlsFromVideo(video);
    if (urls.length === 0) {
      continue;
    }
    const identityKey = buildVideoIdentityKey(video, index);

    let thumbnailCache = "";
    for (const url of urls) {
      const type = detectTypeFromUrl(url) || (url.startsWith("http") ? "mp4" : "");
      if (!type) {
        continue;
      }
      if (!thumbnailCache) {
        thumbnailCache = await buildThumbnail(video, type);
      }
      candidates.push({
        url,
        type,
        source: "dom",
        thumbnail: thumbnailCache,
        thumbnailDebug: getThumbnailDebug(video),
        label: buildCandidateLabel(video, type, url),
        title: guessTitle(video),
        subtitleTracks: [...video.querySelectorAll("track[src]")].map((track) => ({ uri: track.src, language: track.srclang || "", name: track.label || "Subtitles" })),
        identityKey: `${location.href}|${identityKey}`,
        mergeKey: `${location.origin}|${identityKey}`
      });
    }
  }

  return candidates;
}

async function getPageThumbnail(mediaUrl = "") {
  const videos = discoverVideoElements();
  const matches = mediaUrl ? videos.filter((video) => getCandidateUrlsFromVideo(video).includes(mediaUrl)) : videos;
  const players = matches.length ? matches : videos.length === 1 ? videos : [];
  for (const video of players) {
    const thumbnail = await buildThumbnail(video, "video");
    if (!thumbnail.startsWith("data:image/svg+xml;base64,")) return thumbnail;
  }
  return "";
}

async function sendDetectedCandidates() {
  if (scanning) return;
  scanning = true;
  const started = performance.now();
  try {
  if (Date.now() - sitePolicyCheckedAt > 10000) {
    const response = await chrome.runtime.sendMessage({ type: "GET_SITE_POLICY", pageUrl: location.href });
    if (response?.ok) { sitePolicy = response.data; sitePolicyCheckedAt = Date.now(); }
  }
  if (!sitePolicy.detection) { discoveryMetrics.skipped++; return; }
  observePlayerRoots();
  const candidates = await collectDomCandidates();
  if (candidates.length === 0) {
    return;
  }
  const signature = JSON.stringify([location.href, document.title, candidates]);
  if (signature === lastDiscoverySignature && Date.now() - lastDiscoverySentAt < 30000) { discoveryMetrics.skipped++; return; }

  await chrome.runtime.sendMessage({
    type: "DETECTED_CANDIDATES",
    candidates,
    pageUrl: location.href,
    pageTitle: document.title,
    scanMetrics: { ...discoveryMetrics, elapsedMs: discoveryMetrics.elapsedMs + performance.now() - started }
  });
  lastDiscoverySignature = signature; lastDiscoverySentAt = Date.now();
  } finally { scanning = false; discoveryMetrics.scans++; discoveryMetrics.elapsedMs += performance.now() - started; }
}

function scheduleScan() {
  if (scanTimer) {
    clearTimeout(scanTimer);
  }
  scanTimer = setTimeout(() => {
    sendDetectedCandidates().catch(() => {});
  }, SCAN_DEBOUNCE_MS);
}

function observeDomChanges() {
  observePlayerRoots();
  // Attaching a shadow root to an existing host is not a DOM mutation.
  setInterval(() => { if (!document.hidden) { observePlayerRoots(); scheduleScan(); } }, 5000);
}

function sendBlobProgress(cardId, payload) {
  const task = contentTasks.get(cardId);
  if (task?.cancelled) return Promise.resolve();
  if (task?.paused && payload.status === "downloading") payload = { ...payload, status: "paused", stage: "Download paused" };
  return chrome.runtime.sendMessage({
    type: "BLOB_PROGRESS",
    cardId,
    ...payload
  }).catch(() => {});
}

async function handleBlobDownload(payload) {
  if (contentTasks.has(payload.cardId)) return { ok: false, error: "Download already in progress" };
  const task = { paused: false, cancelled: false, waiters: new Set() };
  contentTasks.set(payload.cardId, task);
  try {
    const result = await runBlobDownload(payload);
    return task.cancelled ? { ok: false, cancelled: true, error: "Download cancelled" } : result;
  } finally { contentTasks.delete(payload.cardId); }
}

async function runBlobDownload(payload) {
  const { cardId, blobUrl, filenameBase, methodFamily } = payload;
  if (!cardId || !blobUrl || !filenameBase) {
    return { ok: false, error: "Invalid blob download payload" };
  }

  if (methodFamily === "record") {
    try {
      const video = findVideoByBlobUrl(blobUrl);
      await recordFromVideoElement(video, filenameBase, cardId);
      return { ok: true, mode: "recorded-fallback" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sendBlobProgress(cardId, {
        status: "error",
        stage: "Blob fallback failed",
        error: message,
        mode: "recorded-fallback"
      });
      return { ok: false, error: message };
    }
  }

  try {
    await tryDirectBlobFetch(blobUrl, filenameBase, cardId);
    return { ok: true, mode: "blob-source-copy" };
  } catch (directError) {
    await waitForContentTask(cardId);
    const video = findVideoByBlobUrl(blobUrl);
    try {
      await tryRecoverOriginalSource(video, filenameBase, cardId, blobUrl);
      return { ok: true, mode: "blob-source-recovery" };
    } catch (recoveryError) {
      const message = `Blob fetch: ${directError.message}; source recovery: ${recoveryError.message}`;
      await sendBlobProgress(cardId, {
        status: "error",
        stage: "Blob download failed",
        error: message,
        mode: "blob-source-recovery"
      });
      return { ok: false, error: message };
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "PING":
        return { ok: true };
      case "RESCAN":
        lastDiscoverySignature = ""; lastDiscoverySentAt = 0; sitePolicyCheckedAt = 0;
        await sendDetectedCandidates();
        return { ok: true };
      case "GET_THUMBNAIL_DEBUG":
        return { ok: true, videos: discoverVideoElements().map(getThumbnailDebug) };
      case "GET_PAGE_THUMBNAIL": {
        const thumbnail = await getPageThumbnail(message.mediaUrl || "");
        return { ok: true, thumbnail };
      }
      case "DOWNLOAD_BLOB":
        return handleBlobDownload(message.payload || {});
      case "QUERY_CONTENT_TASK": {
        const task = contentTasks.get(message.cardId);
        return { ok: true, active: Boolean(task && !task.cancelled), paused: Boolean(task?.paused) };
      }
      case "CONTROL_CONTENT_TASK":
        return controlContentTask(message.cardId, message.action);
      case "START_M3U8_SAVE":
      case "START_BINARY_SAVE":
        return handleStartM3u8Save(message.payload || {});
      case "APPEND_M3U8_CHUNK":
      case "APPEND_BINARY_CHUNK":
        return handleAppendM3u8Chunk(message.payload || {});
      case "FINISH_M3U8_SAVE":
      case "FINISH_BINARY_SAVE":
        return handleFinishM3u8Save(message.payload || {});
      case "ABORT_M3U8_SAVE":
      case "ABORT_BINARY_SAVE":
        return handleAbortM3u8Save(message.payload || {});
      default:
        return { ok: false, error: "Unknown message" };
    }
  })()
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });

  return true;
});

observeDomChanges();
scheduleScan();
window.addEventListener("load", () => scheduleScan());

document.addEventListener("loadedmetadata", scheduleScan, true);
document.addEventListener("playing", scheduleScan, true);
