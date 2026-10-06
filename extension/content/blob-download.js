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
  setTimeout(() => URL.revokeObjectURL(url), 60000);
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

  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        media.removeEventListener("loadedmetadata", onLoaded);
        media.removeEventListener("error", onError);
      };
      const onLoaded = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error("Unable to read media metadata")); };
      media.addEventListener("loadedmetadata", onLoaded, { once: true });
      media.addEventListener("error", onError, { once: true });
      const timer = setTimeout(() => { cleanup(); reject(new Error("Media metadata timed out")); }, 15000);
      media.src = objectUrl;
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
  return null;
}

async function tryDirectBlobFetch(blobUrl, fileBase, cardId) {
  await sendBlobProgress(cardId, {
    status: "downloading",
    progress: 10,
    stage: "Trying direct blob fetch",
    mode: "blob-source-copy"
  });

  const blob = await fetchMediaBlob(blobUrl);
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
      if (detectTypeFromUrl(candidate) === "m3u8") continue;
      const blob = await fetchMediaBlob(candidate);
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

