import { parseAttributeList } from "./parse-master.js";

function buildSegmentExtensionSet(segments) {
  return [...new Set(
    segments
      .map((segment) => {
        try {
          return new URL(segment.url).pathname.split(".").pop()?.toLowerCase() || "";
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  )];
}

export function parseMediaPlaylist(text, baseUrl) {
  const lines = text.split(/\r?\n/);
  const segments = [];
  let currentDuration = 0;
  let currentTitle = "";
  let initSegment = null;
  let targetDuration = 0;
  let playlistType = "";
  let mediaSequence = 0;
  let isEndList = false;
  let keyMethod = "NONE";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith("#EXT-X-TARGETDURATION")) {
      targetDuration = Number(line.split(":")[1] || 0);
      continue;
    }
    if (line.startsWith("#EXT-X-PLAYLIST-TYPE")) {
      playlistType = line.split(":")[1] || "";
      continue;
    }
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE")) {
      mediaSequence = Number(line.split(":")[1] || 0);
      continue;
    }
    if (line.startsWith("#EXT-X-ENDLIST")) {
      isEndList = true;
      continue;
    }
    if (line.startsWith("#EXT-X-KEY")) {
      const attrs = parseAttributeList(line);
      keyMethod = attrs.METHOD || keyMethod;
      continue;
    }
    if (line.startsWith("#EXT-X-MAP")) {
      const attrs = parseAttributeList(line);
      if (attrs.URI) {
        initSegment = {
          url: new URL(attrs.URI, baseUrl).href
        };
      }
      continue;
    }
    if (line.startsWith("#EXTINF")) {
      const value = line.slice("#EXTINF:".length).split(",")[0] || "0";
      currentDuration = Number(value);
      currentTitle = line.split(",").slice(1).join(",").trim();
      continue;
    }
    if (line.startsWith("#")) {
      continue;
    }

    segments.push({
      url: new URL(line, baseUrl).href,
      duration: Number.isFinite(currentDuration) ? currentDuration : 0,
      title: currentTitle
    });
    currentDuration = 0;
    currentTitle = "";
  }

  return {
    baseUrl,
    initSegment,
    segments,
    totalDuration: segments.reduce((total, item) => total + (item.duration || 0), 0),
    targetDuration,
    playlistType,
    mediaSequence,
    isEndList,
    keyMethod,
    segmentExtensions: buildSegmentExtensionSet(segments)
  };
}

export function guessExtFromPlaylist(mediaPlaylist) {
  const extensions = mediaPlaylist?.segmentExtensions || [];
  if (extensions.some((ext) => ["m4s", "cmfv", "mp4"].includes(ext))) {
    return "mp4";
  }
  if (extensions.includes("webm")) {
    return "webm";
  }
  if (extensions.includes("mov")) {
    return "mov";
  }
  return "ts";
}
