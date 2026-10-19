import { extractResolution } from "./extract-resolution.js";
import { extractDimensions } from "./extract-dimensions.js";
import { extractBitrate } from "./extract-bitrate.js";
import { extractResolutionFromLabel } from "./extract-resolution-from-label.js";
import { extractBitrateFromLabel } from "./extract-bitrate-from-label.js";
export function variantInfoCompletenessRank(variant) {
  const label = typeof variant.label === "string" ? variant.label : "";
  const url = typeof variant.url === "string" ? variant.url : "";
  const labelDims = extractResolutionFromLabel(label);
  const urlDims = extractDimensions(url);
  const hasResolution = Boolean(labelDims.height || urlDims.height || extractResolution(url));
  const hasBitrate = Boolean(extractBitrateFromLabel(label) || extractBitrate(url));
  if (hasResolution && hasBitrate) {
    return 2;
  }
  if (hasResolution || hasBitrate) {
    return 1;
  }
  return 0;
}
