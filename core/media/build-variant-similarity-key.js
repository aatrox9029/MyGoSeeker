import { normalizeType } from "./normalize-type.js";
import { extractResolution } from "./extract-resolution.js";
import { extractDimensions } from "./extract-dimensions.js";
import { extractBitrate } from "./extract-bitrate.js";
import { normalizeUrlForVariantKey } from "./normalize-url-for-variant-key.js";
import { extractResolutionFromLabel } from "./extract-resolution-from-label.js";
import { extractBitrateFromLabel } from "./extract-bitrate-from-label.js";
import { getVariantMethodFamily } from "../download-methods.js";
export function buildVariantSimilarityKey(variant) {
  const baseType = normalizeType(variant.type);
  const methodFamily = getVariantMethodFamily(variant);
  const urlKey = normalizeUrlForVariantKey(variant.url);
  const labelDims = extractResolutionFromLabel(variant.label);
  const urlDims = extractDimensions(variant.url);
  const width = labelDims.width || urlDims.width || 0;
  const height = labelDims.height || urlDims.height || extractResolution(variant.url) || 0;
  const labelBitrate = extractBitrateFromLabel(variant.label);
  const urlBitrate = extractBitrate(variant.url);
  const bitrate = labelBitrate || urlBitrate || 0;
  const bitrateBucket = bitrate > 0 ? Math.round(bitrate / 100) * 100 : 0;
  const qualityEdge = width && height ? Math.min(width, height) : height;

  if (qualityEdge) {
    return `${baseType}|${methodFamily}|${urlKey}|edge:${qualityEdge}|bitrate:${bitrateBucket || 0}`;
  }
  if (bitrateBucket) {
    return `${baseType}|${methodFamily}|${urlKey}|bitrate:${bitrateBucket}`;
  }
  return `${baseType}|${methodFamily}|${urlKey}`;
}
