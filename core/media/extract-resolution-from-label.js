export function extractResolutionFromLabel(label) {
  if (!label || typeof label !== "string") {
    return { width: 0, height: 0 };
  }
  const dims = label.match(/(\d{3,4})[x*](\d{3,4})/i);
  if (dims) {
    return {
      width: Number(dims[1]) || 0,
      height: Number(dims[2]) || 0
    };
  }
  const heightOnly = label.match(/(?:^|[^\d])(\d{3,4})p(?:[^\d]|$)/i);
  if (heightOnly) {
    return {
      width: 0,
      height: Number(heightOnly[1]) || 0
    };
  }
  return { width: 0, height: 0 };
}
