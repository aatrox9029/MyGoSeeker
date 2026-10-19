import { normalizeType } from "./normalize-type.js";
import { detectTypeFromUrl } from "./detect-type-from-url.js";
import { computeQualityScore } from "./compute-quality-score.js";
import { buildVariantLabel } from "./build-variant-label.js";
import { hashString } from "./hash-string.js";
import { normalizeMethodFamily } from "../download-methods.js";
export function normalizeVariant(variant) {
  if (!variant || typeof variant !== "object" || typeof variant.url !== "string") {
    return null;
  }
  const type = normalizeType(variant.type || detectTypeFromUrl(variant.url));
  if (!type) {
    return null;
  }
  return {
    id: typeof variant.id === "string" ? variant.id : `variant_${hashString(variant.url)}`,
    url: variant.url,
    audioTracks: variant.audioTracks || [], subtitleTracks: variant.subtitleTracks || [], codecs: variant.codecs || "",
    audioUrl: typeof variant.audioUrl === "string" ? variant.audioUrl : "",
    masterUrl: typeof variant.masterUrl === "string" ? variant.masterUrl : "",
    type,
    methodFamily: normalizeMethodFamily(variant.methodFamily),
    source: typeof variant.source === "string" ? variant.source : "unknown",
    label: typeof variant.label === "string" ? variant.label : buildVariantLabel(variant.url, type),
    score: Number.isFinite(variant.score) ? variant.score : computeQualityScore(variant.url, type),
    isBlob: type === "blob",
    isM3u8: type === "m3u8",
    detectedAt: Number.isFinite(variant.detectedAt) ? variant.detectedAt : Date.now()
  };
}
