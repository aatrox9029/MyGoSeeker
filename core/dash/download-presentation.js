import { selectDashTracks } from "./select-tracks.js";
import { captureDynamicDash } from "./capture-dynamic.js";
import { resolveSegmentBase } from "./resolve-segment-base.js";
import { downloadMediaPlaylistResources } from "../hls/download-segments.js";
import { checkEstimatedStreamSize } from "../downloads/stream-size.js";

export async function downloadDashPresentation(tracks, url, streamOptions, options) {
  const result = { video: null, audio: null };
  async function consume(pair) {
    for (const kind of ["video", "audio"]) {
      if (!pair[kind]) continue;
      const track = await resolveSegmentBase(pair[kind], options);
      const previous = result[kind];
      if (previous && previous.info.codecs !== track.codecs) throw new Error("DASH Period codec changed; select a compatible representation");
      const dynamicIndex = tracks.dynamic ? track.segments[0]?.startTime : "";
      const stagePrefix = `${kind}:${track.periodId}:${dynamicIndex}`;
      const resources = await downloadMediaPlaylistResources(track, { ...options, stagePrefix });
      options.logger?.("info", "dash-period", "Downloaded DASH Period", { kind, period: track.periodId, representation: track.id, duration: track.totalDuration, resources: resources.length });
      if (!previous) result[kind] = { text: "#EXTM3U\n#EXT-X-ENDLIST", info: { ...track, totalDuration: 0 }, resources: [], parts: [] };
      const target = result[kind];
      const part = target.parts.find((item) => item.periodId === track.periodId);
      const identity = JSON.stringify([track.id, track.codecs, track.initSegments]);
      if (part) {
        if (part.identity !== identity) throw new Error("Dynamic DASH initialization/representation changed; save a new clip");
        part.resources.push(...resources.filter((item) => item.kind !== "init"));
      } else target.parts.push({ periodId: track.periodId, identity, resources });
      target.resources = target.parts.flatMap((item) => item.resources);
      target.info.totalDuration += track.totalDuration;
    }
  }
  if (tracks.dynamic) await captureDynamicDash(url, tracks, streamOptions.liveSeconds || 30, { ...options, ...streamOptions }, consume);
  else {
    const pairs = selectDashTracks(tracks, streamOptions);
    if (pairs.some((pair) => Boolean(pair.audio) !== Boolean(pairs[0].audio))) throw new Error("DASH audio track disappears across Periods; select a consistent source");
    checkEstimatedStreamSize(pairs.reduce((sum, pair) => sum + pair.video.bandwidth * pair.video.totalDuration / 8 + (pair.audio ? pair.audio.bandwidth * pair.audio.totalDuration / 8 : 0), 0), options.logger);
    for (const pair of pairs) await consume(pair);
  }
  if (!result.video) throw new Error("No playable DASH representation");
  return result;
}
