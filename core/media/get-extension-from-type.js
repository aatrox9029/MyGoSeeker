import { normalizeType } from "./normalize-type.js";
export function getExtensionFromType(type) {
  const normalized = normalizeType(type);
  if (normalized === "m3u8") {
    return "mp4";
  }
  if (normalized === "mpeg") {
    return "mpeg";
  }
  if (normalized) {
    return normalized;
  }
  return "mp4";
}
