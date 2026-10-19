import { getSourceStabilityScore } from "./get-source-stability-score.js";
import { variantInfoCompletenessRank } from "./variant-info-completeness-rank.js";
import { getVariantMethodFamily } from "../download-methods.js";
export function getVariantAttemptPriority(variant) {
  let priority = 0;
  if (variant.isBlob) {
    priority -= 10000;
  }
  priority += (Number.isFinite(variant.score) ? variant.score : 0) * 10;
  priority += variantInfoCompletenessRank(variant) * 1000;
  priority += getSourceStabilityScore(variant) * 100;
  if (variant.isM3u8) {
    priority += 80;
  }
  if (getVariantMethodFamily(variant) === "record") {
    priority -= 5000;
  }
  return priority;
}
