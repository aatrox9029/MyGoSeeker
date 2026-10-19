import { fetchPlaylist } from "./fetch-playlist.js";
import { parseMediaPlaylist } from "./parse-media.js";
import { downloadMediaPlaylistResources } from "./download-segments.js";
import { abortableDelay, throwIfAborted } from "../tasks/operation-control.js";
// Download each sliding window immediately, before the server removes its segments.
export async function captureLivePlaylist(url, firstText, seconds, options) {
  if (!(seconds >= 1 && seconds <= 3600)) throw new Error("Live saving duration must be 1–3600 seconds");
  const segments = [], resources = [], seen = new Set(); let init = null, text = firstText;
  const deadline = Date.now() + seconds * 1000;
  const checkpoint = { prepare: async () => {}, load: (...args) => options.checkpoint.load(...args), save: (...args) => options.checkpoint.save(...args) };
  while (Date.now() < deadline) {
    throwIfAborted(options.signal);
    const info = parseMediaPlaylist(text, url);
    const fresh = info.segments.map((item, index) => ({ ...item, sequence: info.mediaSequence + index })).filter((item) => !seen.has(item.sequence));
    for (const item of fresh) {
      if (segments.length && item.sequence !== segments.at(-1).sequence + 1) throw new Error("Live HLS window skipped segments; retry with a shorter interval");
      if (init && info.initSegment?.url !== init.url) throw new Error("Live initialization changed; save a new clip");
      const batch = { ...info, initSegments: !init && info.initSegment ? [info.initSegment] : [], segments: [item] };
      // Stable sequence indexes keep incremental checkpoints distinct across windows.
      const wrapped = { ...checkpoint, load: (entry, track) => checkpoint.load({ ...entry, index: entry.kind === "segment" ? item.sequence : entry.index }, track), save: (entry, bytes, track) => checkpoint.save({ ...entry, index: entry.kind === "segment" ? item.sequence : entry.index }, bytes, track) };
      resources.push(...await downloadMediaPlaylistResources(batch, { ...options, checkpoint: wrapped, concurrency: 1 }));
      init ||= info.initSegment; segments.push(item); seen.add(item.sequence);
      options.onProgress?.(Math.min(seconds, (seconds * 1000 - Math.max(0, deadline - Date.now())) / 1000), seconds);
      if (segments.reduce((sum, segment) => sum + segment.duration, 0) >= seconds) break;
    }
    if (info.isEndList || segments.reduce((sum, segment) => sum + segment.duration, 0) >= seconds) break;
    await abortableDelay(Math.min(Math.max(250, (info.targetDuration || 1) * 500), Math.max(1, deadline - Date.now())), options.signal);
    const next = await fetchPlaylist(url, options); text = next.text; url = next.url;
  }
  if (!segments.length) throw new Error("No live HLS segments captured");
  const playlistText = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-TARGETDURATION:60", ...(init ? [`#EXT-X-MAP:URI="${init.url}"`] : []), ...segments.flatMap((item) => [`#EXTINF:${item.duration},`, item.url]), "#EXT-X-ENDLIST"].join("\n");
  const info = parseMediaPlaylist(playlistText, url);
  return { text: playlistText, info, resources };
}
