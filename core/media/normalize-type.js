import { VIDEO_TYPES } from "./media-constants.js";
export function normalizeType(type) {
  if (!type || typeof type !== "string") {
    return "";
  }
  const lower = type.toLowerCase();
  if (lower === "mpg") {
    return "mpeg";
  }
  if (VIDEO_TYPES.includes(lower)) {
    return lower;
  }
  return "";
}
