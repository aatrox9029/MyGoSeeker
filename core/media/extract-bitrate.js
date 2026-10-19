export function extractBitrate(rawUrl) {
  if (!rawUrl) {
    return 0;
  }
  const match = rawUrl.match(/(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i);
  if (match) {
    return Number(match[1]);
  }
  return 0;
}
