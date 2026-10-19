export function extractDimensions(rawUrl) {
  if (!rawUrl) {
    return { width: 0, height: 0 };
  }
  const match = rawUrl.match(/(?:^|[^\d])(\d{3,4})[x*](\d{3,4})(?:[^\d]|$)/i);
  if (!match) {
    return { width: 0, height: 0 };
  }
  return {
    width: Number(match[1]) || 0,
    height: Number(match[2]) || 0
  };
}
