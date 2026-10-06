function sanitizeExt(value, fallback) {
  return /^[a-z0-9]{1,8}$/i.test(value || "") ? value : fallback;
}

function createJobPrefix() {
  return `job-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function fileNameForResource(prefix, kind, index, sourceUrl, fallbackExt) {
  const ext = (() => {
    try {
      return sanitizeExt(new URL(sourceUrl).pathname.split(".").pop()?.toLowerCase(), fallbackExt);
    } catch {
      return fallbackExt;
    }
  })();
  if (kind === "init") {
    return `${prefix}-init-${index}.${ext}`;
  }
  return `${prefix}-segment-${String(index).padStart(5, "0")}.${ext}`;
}

function rewritePlaylistText(originalText, resources, fallbackExt, prefix) {
  const lines = originalText.split(/\r?\n/);
  let segmentIndex = 0;
  let initIndex = 0;
  const initResources = resources.filter((item) => item.kind === "init");
  const segmentResources = resources.filter((item) => item.kind === "segment");
  return lines.map((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return rawLine;
    }
    if (line.startsWith("#EXT-X-MAP")) {
      const initResource = initResources[initIndex++];
      if (!initResource) {
        return rawLine;
      }
      return `#EXT-X-MAP:URI="${initResource.fileName}"`;
    }
    if (line.startsWith("#EXT-X-BYTERANGE:") || line.startsWith("#EXT-X-PART:") || line.startsWith("#EXT-X-PRELOAD-HINT:")) return "";
    if (line.startsWith("#")) {
      return rawLine;
    }
    const resource = segmentResources[segmentIndex];
    segmentIndex += 1;
    return resource
      ? fileNameForResource(prefix, "segment", resource.index || 0, resource.sourceUrl, fallbackExt)
      : rawLine;
  }).join("\n");
}

function normalizeResources(resources, fallbackExt, prefix) {
  return resources.map((resource) => ({
    ...resource,
    fileName: fileNameForResource(prefix, resource.kind, resource.index || 0, resource.sourceUrl, fallbackExt)
  }));
}

export function buildRemuxJob({
  videoPlaylistText,
  videoPlaylistInfo,
  videoResources,
  audioPlaylistText = "",
  audioPlaylistInfo = null,
  audioResources = [],
  outputFileName = "output.mp4"
}) {
  const jobPrefix = createJobPrefix();
  const videoFallbackExt = (videoPlaylistInfo?.segmentExtensions || [])[0] || "m4s";
  const audioFallbackExt = (audioPlaylistInfo?.segmentExtensions || [])[0] || "m4s";
  const normalizedVideoResources = normalizeResources(videoResources, videoFallbackExt, `${jobPrefix}-video`);
  const normalizedAudioResources = normalizeResources(audioResources, audioFallbackExt, `${jobPrefix}-audio`);

  return {
    jobPrefix,
    outputFileName: `${jobPrefix}-output.mp4`,
    suggestedFileName: outputFileName,
    video: {
      playlistFileName: `${jobPrefix}-video.m3u8`,
      playlistText: rewritePlaylistText(videoPlaylistText, normalizedVideoResources, videoFallbackExt, `${jobPrefix}-video`),
      resources: normalizedVideoResources
    },
    audio: audioPlaylistText
      ? {
          playlistFileName: `${jobPrefix}-audio.m3u8`,
          playlistText: rewritePlaylistText(audioPlaylistText, normalizedAudioResources, audioFallbackExt, `${jobPrefix}-audio`),
          resources: normalizedAudioResources
        }
      : null
  };
}
