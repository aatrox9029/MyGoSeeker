import { variantLabelDetailScore } from "./variant-label-detail-score.js";
import { getSourceStabilityScore } from "./get-source-stability-score.js";
import { variantInfoCompletenessRank } from "./variant-info-completeness-rank.js";
export function choosePreferredVariant(existing, incoming) {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }
  const existingCompleteness = variantInfoCompletenessRank(existing);
  const incomingCompleteness = variantInfoCompletenessRank(incoming);
  if (incomingCompleteness !== existingCompleteness) {
    return incomingCompleteness > existingCompleteness ? incoming : existing;
  }
  const existingDetail = variantLabelDetailScore(existing);
  const incomingDetail = variantLabelDetailScore(incoming);
  if (incomingDetail !== existingDetail) {
    return incomingDetail > existingDetail ? incoming : existing;
  }
  const existingStability = getSourceStabilityScore(existing);
  const incomingStability = getSourceStabilityScore(incoming);
  if (incomingStability !== existingStability) {
    return incomingStability > existingStability ? incoming : existing;
  }
  if (incoming.score !== existing.score) {
    return incoming.score > existing.score ? incoming : existing;
  }
  return incoming.detectedAt > existing.detectedAt ? incoming : existing;
}
