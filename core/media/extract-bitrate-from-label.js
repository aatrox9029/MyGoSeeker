export function extractBitrateFromLabel(label) {
  if (!label || typeof label !== "string") {
    return 0;
  }
  const match = label.match(/(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i);
  if (!match) {
    return 0;
  }
  return Number(match[1]) || 0;
}
