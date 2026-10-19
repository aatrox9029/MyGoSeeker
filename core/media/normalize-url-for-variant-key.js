export function normalizeUrlForVariantKey(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return url.href;
  } catch {
    return rawUrl.split("?")[0].toLowerCase();
  }
}
