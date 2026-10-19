import { getSourceStabilityScore } from "./get-source-stability-score.js";
import { variantInfoCompletenessRank } from "./variant-info-completeness-rank.js";
export function chooseBestVariant(variants) {
  return [...variants].sort((a, b) => {
    if (a.isBlob !== b.isBlob) {
      return a.isBlob ? 1 : -1;
    }
    const aCompleteness = variantInfoCompletenessRank(a);
    const bCompleteness = variantInfoCompletenessRank(b);
    if (aCompleteness !== bCompleteness) {
      return bCompleteness - aCompleteness;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const aStability = getSourceStabilityScore(a);
    const bStability = getSourceStabilityScore(b);
    if (aStability !== bStability) {
      return bStability - aStability;
    }
    if (a.isM3u8 !== b.isM3u8) {
      return a.isM3u8 ? -1 : 1;
    }
    return b.detectedAt - a.detectedAt;
  })[0];
}
