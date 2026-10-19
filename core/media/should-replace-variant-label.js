import { variantLabelDetailScore } from "./variant-label-detail-score.js";
import { variantInfoCompletenessRank } from "./variant-info-completeness-rank.js";
export function shouldReplaceVariantLabel(currentLabel, nextLabel) {
  if (!nextLabel || typeof nextLabel !== "string") {
    return false;
  }
  if (!currentLabel || typeof currentLabel !== "string") {
    return true;
  }
  const currentDetail = variantLabelDetailScore({ label: currentLabel, source: "" });
  const nextDetail = variantLabelDetailScore({ label: nextLabel, source: "" });
  if (nextDetail !== currentDetail) {
    return nextDetail > currentDetail;
  }
  const currentCompleteness = variantInfoCompletenessRank({ label: currentLabel, url: "" });
  const nextCompleteness = variantInfoCompletenessRank({ label: nextLabel, url: "" });
  if (nextCompleteness !== currentCompleteness) {
    return nextCompleteness > currentCompleteness;
  }
  return false;
}
