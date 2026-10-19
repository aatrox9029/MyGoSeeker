export function extractResolution(rawUrl) {
  if (!rawUrl) {
    return 0;
  }
  const dimensionMatch = rawUrl.match(/(?:^|[^\d])(\d{3,4})[x*](\d{3,4})(?:[^\d]|$)/i);
  if (dimensionMatch) {
    return Number(dimensionMatch[2]) || 0;
  }
  const match = rawUrl.match(/(?:^|[^\d])(2160|1440|1080|720|540|480|360|240)p?(?:[^\d]|$)/i);
  if (match) {
    return Number(match[1]);
  }
  return 0;
}
