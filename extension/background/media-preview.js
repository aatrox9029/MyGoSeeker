import { fetchPlaylist } from "../../core/hls/fetch-playlist.js";
import { fetchWithRetry } from "../../core/network/fetch-retry.js";
import { parseMpd } from "../../core/dash/parse-mpd.js";
import { parseMasterPlaylist } from "../../core/hls/parse-master.js";
import { parseMediaPlaylist } from "../../core/hls/parse-media.js";
import { MAX_REMUX_BYTES } from "../../core/hls/segment-checkpoint.js";
import { selectDashTracks } from "../../core/dash/select-tracks.js";
export async function previewMedia(card, variant) {
  if (!variant) throw new Error("Variant not found");
  const result = { type: variant.type, codecs: variant.codecs || "", audioTracks: variant.audioTracks || [], subtitleTracks: variant.subtitleTracks || [], estimatedBytes: null,
    limits: "Browser remux: 256 MiB total, 16 MiB per segment. Native helper supports direct/HLS. DRM is unsupported." };
  const options = { retries: 1, timeoutMs: 8000, maxBytes: 2 * 1024 * 1024, credentials: card.requestCredentials || "include" };
  if (variant.type === "mpd") {
    const tracks = parseMpd(await fetchWithRetry(variant.url, "text", options), variant.url);
    result.dynamic = tracks.dynamic; result.periods = [...new Set(tracks.map((t) => t.periodId))].length;
    result.tracks = tracks.map(({ id, kind, codecs, language, height, bandwidth, totalDuration, segmentBase }) => ({ id, kind, codecs, language, height, bandwidth, duration: totalDuration, segmentBase: Boolean(segmentBase) }));
    if (!tracks.dynamic) result.estimatedBytes = selectDashTracks(tracks).reduce((sum, pair) => sum + pair.video.bandwidth * pair.video.totalDuration / 8 + (pair.audio ? pair.audio.bandwidth * pair.audio.totalDuration / 8 : 0), 0) || null;
  } else if (variant.isM3u8) {
    const playlist = await fetchPlaylist(variant.url, options);
    if (/^#EXT-X-STREAM-INF/im.test(playlist.text)) result.tracks = parseMasterPlaylist(playlist.text, playlist.url);
    else { const info = parseMediaPlaylist(playlist.text, playlist.url); result.duration = info.totalDuration; result.dynamic = !info.isEndList; result.encrypted = info.encrypted; }
  }
  result.exceedsBrowserLimit = result.estimatedBytes > MAX_REMUX_BYTES;
  return result;
}
