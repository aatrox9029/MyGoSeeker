export function getSourceStabilityScore(variant) {
  let score = 0;
  const source = typeof variant?.source === "string" ? variant.source.toLowerCase() : "";
  const url = typeof variant?.url === "string" ? variant.url : "";

  if (url.startsWith("https://")) {
    score += 8;
  }
  if (source.includes("master")) {
    score += 14;
  }
  if (source.includes("network")) {
    score += 10;
  }
  if (source.includes("dom")) {
    score += 6;
  }
  if (source.includes("unknown")) {
    score += 2;
  }
  if (variant?.isBlob) {
    score -= 6;
  }
  return score;
}
