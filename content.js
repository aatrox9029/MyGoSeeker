const SCAN_DEBOUNCE_MS = 1000;
const MAX_REASONABLE_DURATION_SECONDS = 12 * 60 * 60;
const TRANSFER_CHUNK_BYTES = 64 * 1024;
let scanTimer = null;
const binaryTransfers = new Map();
const thumbnailCacheByVideo = new WeakMap();

function detectTypeFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }
  if (rawUrl.startsWith("blob:")) {
    return "blob";
  }
  const lower = rawUrl.toLowerCase();
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

async function captureFrameThumbnail(video) {
  if (!video.videoWidth || !video.videoHeight) {
    return "";
  }

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "";
  }

  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return "";
  }
}

async function buildThumbnail(video, detectedType) {
  const cached = thumbnailCacheByVideo.get(video);
  if (cached) {
    return cached;
  }

  if (video.poster) {
    const poster = absoluteUrl(video.poster);
    thumbnailCacheByVideo.set(video, poster);
    return poster;
  }

  const frame = await captureFrameThumbnail(video);
  if (frame) {
    thumbnailCacheByVideo.set(video, frame);
    return frame;
  }

  const placeholder = createPlaceholderThumbnail(detectedType);
  thumbnailCacheByVideo.set(video, placeholder);
  return placeholder;
}

async function collectDomCandidates() {
  const videos = [...document.querySelectorAll("video")];
  const candidates = [];

  for (const video of videos) {
    const urls = getCandidateUrlsFromVideo(video);
    if (urls.length === 0) {
      continue;
    }

    let thumbnailCache = "";
    for (const url of urls) {
      const type = detectTypeFromUrl(url);
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
        label: buildCandidateLabel(video, type, url),
        title: guessTitle(video),
        mergeKey: `${location.origin}|${video.currentSrc || video.src || url}`
      });
    }
  }

  return candidates;
}

async function getPageThumbnail() {
  const videos = [...document.querySelectorAll("video")];
  for (const video of videos) {
    if (video.poster) {
      return absoluteUrl(video.poster);
    }
  }
  for (const video of videos) {
    const frame = await captureFrameThumbnail(video);
    if (frame) {
      return frame;
    }
  }
  return "";
}

async function sendDetectedCandidates() {
  const candidates = await collectDomCandidates();
  if (candidates.length === 0) {
    return;
  }

  await chrome.runtime.sendMessage({
    type: "DETECTED_CANDIDATES",
    candidates,
    pageUrl: location.href,
    pageTitle: document.title
  });
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
  const observer = new MutationObserver(() => {
    scheduleScan();
  });

  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "poster"]
  });
}

function sendBlobProgress(cardId, payload) {
  return chrome.runtime.sendMessage({
    type: "BLOB_PROGRESS",
    cardId,
    ...payload
  }).catch(() => {});
}

function getExtFromMime(mimeType) {
  if (!mimeType) {
    return "mp4";
  }
  const lower = mimeType.toLowerCase();
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("webm")) return "webm";
  if (lower.includes("quicktime")) return "mov";
  return "mp4";
}

function downloadBlobToFile(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function saveBlobToFile(blob, fileName) {
  try {
    downloadBlobToFile(blob, fileName);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

async function validateVideoBlob(blob, options = {}) {
  const {
    allowMetadataFailure = false,
    minSize = 1
  } = options;
  const objectUrl = URL.createObjectURL(blob);
  const media = document.createElement("video");
  media.preload = "metadata";
  media.muted = true;
  media.src = objectUrl;

  try {
    await new Promise((resolve, reject) => {
      const onLoaded = () => resolve();
      const onError = () => reject(new Error("Unable to read media metadata"));
      media.addEventListener("loadedmetadata", onLoaded, { once: true });
      media.addEventListener("error", onError, { once: true });
    });
    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    const seekable = media.seekable?.length ? media.seekable.end(media.seekable.length - 1) : 0;
    if (!(blob.size >= minSize && duration > 0 && (seekable > 0 || duration > 0))) {
      throw new Error("Blob validation failed");
    }
    return { duration, seekable, size: blob.size };
  } catch (error) {
    const mimeType = typeof blob.type === "string" ? blob.type.toLowerCase() : "";
    if (allowMetadataFailure && blob.size >= minSize && (mimeType.startsWith("video/") || !mimeType)) {
      return {
        duration: 0,
        seekable: 0,
        size: blob.size,
        metadataDeferred: true
      };
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    URL.revokeObjectURL(objectUrl);
    media.removeAttribute("src");
    media.load();
  }
}

function findVideoByBlobUrl(blobUrl) {
  const videos = [...document.querySelectorAll("video")];
  for (const video of videos) {
    if (video.currentSrc === blobUrl || video.src === blobUrl) {
      return video;
    }
    const source = [...video.querySelectorAll("source[src]")].find((item) => item.src === blobUrl);
    if (source) {
      return video;
    }
  }
  return videos.find((video) => (video.currentSrc || "").startsWith("blob:")) || null;
}

async function tryDirectBlobFetch(blobUrl, fileBase, cardId) {
  await sendBlobProgress(cardId, {
    status: "downloading",
    progress: 10,
    stage: "Trying direct blob fetch",
    mode: "blob-source-copy"
  });

  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw new Error(`Blob fetch failed (${response.status})`);
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error("Fetched blob is empty");
  }
  await validateVideoBlob(blob);

  const ext = getExtFromMime(blob.type);
  const filename = `${fileBase}.${ext}`;
  await saveBlobToFile(blob, filename);

  await sendBlobProgress(cardId, {
    status: "completed",
    progress: 100,
    stage: "Blob downloaded directly",
    mode: "blob-source-copy"
  });
}

function getRecoverableVideoUrls(video, blobUrl) {
  const values = new Set();
  const attrNames = ["src", "currentSrc", "data-src", "data-url", "data-hls", "data-video-url"];
  for (const attrName of attrNames) {
    const value = video?.getAttribute?.(attrName) || video?.[attrName] || "";
    if (typeof value === "string" && value && value !== blobUrl && !value.startsWith("blob:")) {
      values.add(absoluteUrl(value));
    }
  }
  for (const source of video?.querySelectorAll?.("source[src]") || []) {
    if (source.src && source.src !== blobUrl && !source.src.startsWith("blob:")) {
      values.add(absoluteUrl(source.src));
    }
  }
  return [...values].filter((value) => detectTypeFromUrl(value));
}

async function tryRecoverOriginalSource(video, fileBase, cardId, blobUrl) {
  const candidates = getRecoverableVideoUrls(video, blobUrl);
  if (candidates.length === 0) {
    throw new Error("No recoverable non-blob source found");
  }

  await sendBlobProgress(cardId, {
    status: "downloading",
    progress: 16,
    stage: "Trying original source recovery before recording",
    mode: "blob-source-recovery"
  });

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) {
        throw new Error(`Source fetch failed (${response.status})`);
      }
      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error("Recovered source is empty");
      }
      await validateVideoBlob(blob);
      const ext = detectTypeFromUrl(candidate) || getExtFromMime(blob.type);
      await saveBlobToFile(blob, `${fileBase}.${ext}`);
      await sendBlobProgress(cardId, {
        status: "completed",
        progress: 100,
        stage: "Recovered original source",
        mode: "blob-source-recovery"
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Original source recovery failed");
}

function getRecorderConfig(hasAudioTrack) {
  const candidates = hasAudioTrack
    ? [
      { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
      { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
      { mime: "video/webm", ext: "webm" },
      { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
      { mime: "video/mp4", ext: "mp4" },
      { mime: "video/quicktime", ext: "mov" }
    ]
    : [
      { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
      { mime: "video/mp4", ext: "mp4" },
      { mime: "video/webm", ext: "webm" },
      { mime: "video/quicktime", ext: "mov" }
    ];

  for (const item of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(item.mime)) {
      return item;
    }
  }

  return { mime: "", ext: hasAudioTrack ? "webm" : "mp4" };
}

function getVideoCaptureStream(video) {
  if (typeof video.captureStream === "function") {
    return video.captureStream();
  }
  if (typeof video.mozCaptureStream === "function") {
    return video.mozCaptureStream();
  }
  throw new Error("captureStream is not supported on this page");
}

async function buildRecordingStream(video) {
  const baseStream = getVideoCaptureStream(video);
  if (baseStream.getAudioTracks().length > 0) {
    return {
      stream: baseStream,
      hasAudioTrack: true,
      cleanup: () => {}
    };
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return {
      stream: baseStream,
      hasAudioTrack: false,
      cleanup: () => {}
    };
  }

  let audioContext = null;
  let sourceNode = null;
  let destinationNode = null;

  try {
    audioContext = new AudioContextCtor();
    if (audioContext.state === "suspended") {
      await audioContext.resume().catch(() => {});
    }
    sourceNode = audioContext.createMediaElementSource(video);
    destinationNode = audioContext.createMediaStreamDestination();
    sourceNode.connect(destinationNode);

    const mergedStream = new MediaStream();
    for (const track of baseStream.getVideoTracks()) {
      mergedStream.addTrack(track);
    }
    for (const track of destinationNode.stream.getAudioTracks()) {
      mergedStream.addTrack(track);
    }

    if (mergedStream.getAudioTracks().length === 0) {
      throw new Error("Audio track is unavailable from media element");
    }

    return {
      stream: mergedStream,
      hasAudioTrack: true,
      cleanup: () => {
        try {
          sourceNode.disconnect();
        } catch {
          // Ignore disconnect failure.
        }
        try {
          destinationNode.disconnect();
        } catch {
          // Ignore disconnect failure.
        }
        audioContext.close().catch(() => {});
      }
    };
  } catch {
    if (sourceNode) {
      try {
        sourceNode.disconnect();
      } catch {
        // Ignore disconnect failure.
      }
    }
    if (destinationNode) {
      try {
        destinationNode.disconnect();
      } catch {
        // Ignore disconnect failure.
      }
    }
    if (audioContext) {
      audioContext.close().catch(() => {});
    }
    return {
      stream: baseStream,
      hasAudioTrack: false,
      cleanup: () => {}
    };
  }
}

async function recordFromVideoElement(video, fileBase, cardId) {
  if (!video) {
    throw new Error("No playable video element for captureStream fallback");
  }

  const originalMuted = Boolean(video.muted);
  const originalVolume = Number.isFinite(video.volume) ? video.volume : 1;
  video.muted = false;
  if (video.volume === 0) {
    video.volume = 1;
  }

  const recordingStream = await buildRecordingStream(video);
  const stream = recordingStream.stream;
  const config = getRecorderConfig(recordingStream.hasAudioTrack);
  const recorder = config.mime ? new MediaRecorder(stream, { mimeType: config.mime }) : new MediaRecorder(stream);
  const chunks = [];

  const durationInfo = resolveEffectiveDuration(video);
  const duration = durationInfo.duration;
  const startTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

  await sendBlobProgress(cardId, {
    status: "downloading",
    progress: 18,
    stage: recordingStream.hasAudioTrack
      ? (durationInfo.usedFallback ? "Recording with fallback duration estimate" : "Recording with captureStream fallback")
      : "Recording fallback (audio track unavailable)",
    mode: "recorded-fallback"
  });

  return new Promise((resolve, reject) => {
    let finished = false;
    let progressInterval = null;
    let timeoutId = null;
    let waitingForPlayback = true;
    let inactivityReason = "playback";

    const clearStopTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = null;
    };

    const scheduleStopTimer = () => {
      clearStopTimer();
      if (video.ended) {
        return;
      }
      const remaining = duration > 0
        ? Math.max(duration - (Number.isFinite(video.currentTime) ? video.currentTime : startTime), 0)
        : 0;
      const maxMs = duration > 0
        ? Math.min(Math.max(remaining * 2000 + 15000, 60000), 30 * 60 * 1000)
        : 10 * 60 * 1000;
      timeoutId = setTimeout(() => {
        if (recorder.state === "recording" || recorder.state === "paused") {
          recorder.stop();
        }
      }, maxMs);
    };

    const updateRecorderForPlaybackState = (reason = "playback") => {
      inactivityReason = reason;
      if (finished) {
        return;
      }
      const activelyPlaying = !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      if (activelyPlaying) {
        waitingForPlayback = false;
        if (recorder.state === "paused") {
          recorder.resume();
        }
        scheduleStopTimer();
        return;
      }
      clearStopTimer();
      if (recorder.state === "recording") {
        recorder.pause();
      }
    };

    const finish = (error) => {
      if (finished) {
        return;
      }
      finished = true;
      clearInterval(progressInterval);
      clearStopTimer();
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("play", onPlayStateChange);
      video.removeEventListener("playing", onPlayStateChange);
      video.removeEventListener("pause", onPauseStateChange);
      video.removeEventListener("waiting", onWaitingStateChange);
      video.removeEventListener("stalled", onWaitingStateChange);
      video.removeEventListener("seeking", onWaitingStateChange);
      video.removeEventListener("seeked", onPlayStateChange);
      video.muted = originalMuted;
      video.volume = originalVolume;
      recordingStream.cleanup();
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore stop failure.
        }
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const onEnded = () => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
      if (recorder.state === "paused") {
        recorder.resume();
        recorder.stop();
      }
    };

    const onPlayStateChange = () => {
      updateRecorderForPlaybackState("playback");
    };

    const onPauseStateChange = () => {
      updateRecorderForPlaybackState("paused");
    };

    const onWaitingStateChange = () => {
      updateRecorderForPlaybackState("buffering");
    };

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      finish(new Error(event.error?.message || "MediaRecorder error"));
    };

    recorder.onstop = async () => {
      try {
        const mimeType = recorder.mimeType || config.mime || "video/webm";
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size === 0) {
          throw new Error("Recorded file is empty");
        }
        const validation = await validateVideoBlob(blob, {
          allowMetadataFailure: true,
          minSize: 32 * 1024
        });

        const ext = getExtFromMime(mimeType) || config.ext;
        const filename = `${fileBase}.${ext}`;
        await saveBlobToFile(blob, filename);

        await sendBlobProgress(cardId, {
          status: "completed",
          progress: 100,
          stage: validation.metadataDeferred
            ? `Recorded as ${ext.toUpperCase()} (metadata deferred, last resort)`
            : `Recorded as ${ext.toUpperCase()} (last resort)`,
          mode: "recorded-fallback"
        });

        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };

    video.addEventListener("ended", onEnded);
    video.addEventListener("play", onPlayStateChange);
    video.addEventListener("playing", onPlayStateChange);
    video.addEventListener("pause", onPauseStateChange);
    video.addEventListener("waiting", onWaitingStateChange);
    video.addEventListener("stalled", onWaitingStateChange);
    video.addEventListener("seeking", onWaitingStateChange);
    video.addEventListener("seeked", onPlayStateChange);

    progressInterval = setInterval(() => {
      if (duration > 0) {
        const remainingDuration = Math.max(duration - startTime, 0.001);
        const ratio = clamp((video.currentTime - startTime) / remainingDuration, 0, 1);
        const progress = 20 + ratio * 75;
        sendBlobProgress(cardId, {
          status: "downloading",
          progress,
          stage: waitingForPlayback
            ? "Waiting for video playback before recording"
            : inactivityReason === "paused"
              ? "Recording paused with video"
              : inactivityReason === "buffering"
                ? "Recording paused while video buffers"
                : durationInfo.usedFallback
                  ? "Recording stream (fallback duration)"
                  : "Recording stream",
          mode: "recorded-fallback"
        });
      }
    }, 500);

    Promise.resolve(video.play())
      .catch(() => {
        // Ignore play failure and still attempt recording current playback state.
      })
      .finally(() => {
        try {
          recorder.start(1000);
          updateRecorderForPlaybackState("playback");
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
  });
}

async function handleBlobDownload(payload) {
  const { cardId, blobUrl, filenameBase } = payload;
  if (!cardId || !blobUrl || !filenameBase) {
    return { ok: false, error: "Invalid blob download payload" };
  }

  try {
    await tryDirectBlobFetch(blobUrl, filenameBase, cardId);
    return { ok: true, mode: "blob-source-copy" };
  } catch {
    const video = findVideoByBlobUrl(blobUrl);
    try {
      await tryRecoverOriginalSource(video, filenameBase, cardId, blobUrl);
      return { ok: true, mode: "blob-source-recovery" };
    } catch {
      // Fall through to recording.
    }
    try {
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
}

async function handleStartM3u8Save(payload) {
  const { transferId, filename, mimeType } = payload || {};
  if (!transferId || typeof transferId !== "string") {
    return { ok: false, error: "Missing transferId" };
  }
  if (!filename || typeof filename !== "string") {
    return { ok: false, error: "Invalid filename for m3u8 save" };
  }
  binaryTransfers.set(transferId, {
    filename,
    mimeType: typeof mimeType === "string" && mimeType ? mimeType : "application/octet-stream",
    chunks: []
  });
  return { ok: true };
}

async function handleAppendM3u8Chunk(payload) {
  const { transferId, chunkBase64 } = payload || {};
  if (!transferId || typeof transferId !== "string") {
    return { ok: false, error: "Missing transferId" };
  }
  if (!chunkBase64 || typeof chunkBase64 !== "string") {
    return { ok: false, error: "Invalid m3u8 chunk payload" };
  }
  const transfer = binaryTransfers.get(transferId);
  if (!transfer) {
    return { ok: false, error: "M3U8 transfer not found" };
  }
  transfer.chunks.push(base64ToUint8Array(chunkBase64));
  return { ok: true };
}

async function handleFinishM3u8Save(payload) {
  const { transferId } = payload || {};
  if (!transferId || typeof transferId !== "string") {
    return { ok: false, error: "Missing transferId" };
  }
  const transfer = binaryTransfers.get(transferId);
  if (!transfer) {
    return { ok: false, error: "M3U8 transfer not found" };
  }
  try {
    const blob = new Blob(transfer.chunks, { type: transfer.mimeType });
    downloadBlobToFile(blob, transfer.filename);
    binaryTransfers.delete(transferId);
    return { ok: true };
  } catch (error) {
    binaryTransfers.delete(transferId);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function handleAbortM3u8Save(payload) {
  const { transferId } = payload || {};
  if (transferId && typeof transferId === "string") {
    binaryTransfers.delete(transferId);
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "PING":
        return { ok: true };
      case "RESCAN":
        await sendDetectedCandidates();
        return { ok: true };
      case "GET_PAGE_THUMBNAIL": {
        const thumbnail = await getPageThumbnail();
        return { ok: true, thumbnail };
      }
      case "DOWNLOAD_BLOB":
        return handleBlobDownload(message.payload || {});
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
