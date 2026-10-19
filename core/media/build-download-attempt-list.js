import { buildVariantSimilarityKey } from "./build-variant-similarity-key.js";
import { chooseBestVariant } from "./choose-best-variant.js";
import { getVariantById } from "./get-variant-by-id.js";
import { getVariantMethodFamily } from "../download-methods.js";
import { getVariantAttemptPriority } from "./get-variant-attempt-priority.js";
export function buildDownloadAttemptList(card, preferredVariantId) {
  if (!card || !Array.isArray(card.variants) || card.variants.length === 0) {
    return [];
  }
  const preferred = getVariantById(card, preferredVariantId) || chooseBestVariant(card.variants);
  if (!preferred) {
    return [];
  }
  const preferredFamily = getVariantMethodFamily(preferred);

  const preferredKey = buildVariantSimilarityKey(preferred);
  const sameQuality = card.variants
    .filter((variant) => {
      return variant.id !== preferred.id
        && getVariantMethodFamily(variant) === preferredFamily
        && buildVariantSimilarityKey(variant) === preferredKey;
    })
    .sort((a, b) => getVariantAttemptPriority(b) - getVariantAttemptPriority(a));

  const remaining = card.variants
    .filter((variant) => {
      return variant.id !== preferred.id
        && getVariantMethodFamily(variant) === preferredFamily
        && buildVariantSimilarityKey(variant) !== preferredKey;
    })
    .sort((a, b) => getVariantAttemptPriority(b) - getVariantAttemptPriority(a));

  return [preferred.id, ...sameQuality.map((variant) => variant.id), ...remaining.map((variant) => variant.id)];
}
