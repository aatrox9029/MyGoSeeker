import { fetchWithRetry } from "../network/fetch-retry.js";
import { parseSidx } from "./parse-sidx.js";
export async function resolveSegmentBase(track, options = {}) {
  if (!track.segmentBase) return track;
  const { url, indexRange } = track.segmentBase;
  const buffer = await fetchWithRetry(url, "arrayBuffer", { ...options, byteRange: indexRange, maxBytes: 2 * 1024 * 1024, stage: "dash-index" });
  let segments = parseSidx(buffer, indexRange.offset, url).map((segment) => ({ ...segment, startTime: track.start + segment.startTime - (track.segmentBase.presentationOffset || 0) }));
  const live = track.segmentBase.live;
  if (live) segments = segments.filter((segment) => segment.startTime + segment.duration <= live.end && segment.startTime + segment.duration > live.start);
  options.logger?.("info", "dash-index", "Resolved sidx byte ranges", { period: track.periodId, representation: track.id, segments: segments.length });
  return { ...track, segmentBase: null, segments, totalDuration: segments.reduce((sum, item) => sum + item.duration, 0) };
}
