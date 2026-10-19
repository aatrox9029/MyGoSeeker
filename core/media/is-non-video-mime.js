export function isNonVideoMime(mime) {
  if (!mime) {
    return false;
  }
  const lower = mime.toLowerCase();
  if (lower.startsWith("video/")) {
    return false;
  }
  return lower.startsWith("text/")
    || lower.includes("html")
    || lower.includes("json")
    || lower.includes("xml")
    || lower.includes("javascript");
}
