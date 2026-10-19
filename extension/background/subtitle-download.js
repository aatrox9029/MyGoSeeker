import { parseMediaPlaylist } from "../../core/hls/parse-media.js";
import { fetchWithRetry } from "../../core/network/fetch-retry.js";
import { mergeWebVtt } from "../../core/subtitles/merge-webvtt.js";
export async function downloadSubtitle(card, uri, buildFileName) {
  const variants = card.variants.flatMap((variant) => variant.subtitleTracks || []);
  const track = variants.find((item) => item.uri === uri);
  if (!track) throw new Error("Subtitle track unavailable; rescan the source");
  let finalUrl = uri;
  let text = await fetchWithRetry(uri, "text", { maxBytes: 2 * 1024 * 1024, onResponse: (response) => { finalUrl = response.url || uri; } });
  if (/^#EXTM3U/.test(text)) {
    const playlist = parseMediaPlaylist(text, finalUrl);
    if (playlist.encrypted || !playlist.isEndList) throw new Error("Encrypted or live subtitles are not supported");
    if (playlist.segments.length > 1000) throw new Error("Subtitle segment count exceeds limit");
    const cues = [];
    for (const segment of playlist.segments) {
      const bytes = await fetchWithRetry(segment.url, "arrayBuffer", { maxBytes: 2 * 1024 * 1024, byteRange: segment.byteRange, allowText: true });
      const chunk = new TextDecoder().decode(bytes);
      if (!/^WEBVTT/.test(chunk)) throw new Error("Unsupported subtitle format; WebVTT required");
      cues.push(chunk);
      if (cues.reduce((size, cue) => size + cue.length, 0) > 8 * 1024 * 1024) throw new Error("Subtitle exceeds capacity limit");
    }
    text = mergeWebVtt(cues);
  }
  if (!/^WEBVTT/.test(text)) throw new Error("Unsupported subtitle format; WebVTT required");
  return chrome.downloads.download({ url: `data:text/vtt;charset=utf-8,${encodeURIComponent(text)}`, filename: buildFileName({ ...card, title: `${card.title}-${track.language || track.name || "subtitles"}` }, {}, "vtt"), saveAs: false, conflictAction: "uniquify" });
}
