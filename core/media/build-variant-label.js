import { extractResolution } from "./extract-resolution.js";
import { extractDimensions } from "./extract-dimensions.js";
import { extractBitrate } from "./extract-bitrate.js";
export function buildVariantLabel(rawUrl, type) {
  const dims = extractDimensions(rawUrl);
  const resolution = type === "m3u8"
    ? 0
    : extractResolution(rawUrl);
  const bitrate = extractBitrate(rawUrl);
  const parts = [];
  if (dims.width && dims.height) {
    parts.push(`${dims.width}*${dims.height}`);
  } else if (resolution) {
    parts.push(`${resolution}p`);
  } else if (type === "m3u8") {
    parts.push("Auto");
  }
  if (bitrate) {
    parts.push(`${bitrate}k`);
  }
  if (parts.length === 0) {
    parts.push(type.toUpperCase());
  }
  return `${parts.join(" ")} (${type})`;
}
