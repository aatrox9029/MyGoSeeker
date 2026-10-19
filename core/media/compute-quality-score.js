import { extractResolution } from "./extract-resolution.js";
import { extractDimensions } from "./extract-dimensions.js";
import { extractBitrate } from "./extract-bitrate.js";
export function computeQualityScore(rawUrl, type) {
  const dims = extractDimensions(rawUrl);
  const resolution = type === "m3u8"
    ? (dims.height || 0)
    : extractResolution(rawUrl);
  const bitrate = extractBitrate(rawUrl);
  const m3u8Boost = type === "m3u8" ? 0.001 : 0;
  return resolution * 10000 + dims.width + bitrate / 10 + m3u8Boost;
}
