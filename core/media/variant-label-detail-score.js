export function variantLabelDetailScore(variant) {
  let score = 0;
  const label = typeof variant.label === "string" ? variant.label : "";
  if (/(\d{3,4})[x*](\d{3,4})/i.test(label)) {
    score += 3;
  } else if (/(?:^|[^\d])(\d{3,4})p(?:[^\d]|$)/i.test(label)) {
    score += 2;
  }
  if (/(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i.test(label)) {
    score += 2;
  }
  if (typeof variant.source === "string" && variant.source.includes(":master")) {
    score += 1;
  }
  return score;
}
