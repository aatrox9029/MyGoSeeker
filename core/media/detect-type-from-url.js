import { normalizeType } from "./normalize-type.js";
export function detectTypeFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }
  if (rawUrl.startsWith("blob:")) {
    return "blob";
  }
  const lower = rawUrl.toLowerCase();
  if (lower.includes(".mpd")) return "mpd";
  if (lower.includes(".m3u8")) {
    return "m3u8";
  }
  if (lower.includes(".webm")) {
    return "webm";
  }
  if (lower.includes(".mp4")) {
    return "mp4";
  }
  if (lower.includes(".mov")) {
    return "mov";
  }
  if (lower.includes(".m4v")) {
    return "m4v";
  }
  if (lower.includes(".mkv")) {
    return "mkv";
  }
  if (lower.includes(".avi")) {
    return "avi";
  }
  if (lower.includes(".flv")) {
    return "flv";
  }
  if (lower.includes(".mpeg") || lower.includes(".mpg")) {
    return "mpeg";
  }

  try {
    const url = new URL(rawUrl);
    const ext = url.pathname.split(".").pop()?.toLowerCase() || "";
    return normalizeType(ext);
  } catch {
    return "";
  }
}
