import { isPlaceholderThumbnail } from "./is-placeholder-thumbnail.js";
export function shouldReplaceThumbnail(currentThumbnail, nextThumbnail) {
  if (!nextThumbnail || typeof nextThumbnail !== "string") {
    return false;
  }
  if (!currentThumbnail || typeof currentThumbnail !== "string") {
    return true;
  }
  const currentPlaceholder = isPlaceholderThumbnail(currentThumbnail);
  const nextPlaceholder = isPlaceholderThumbnail(nextThumbnail);
  if (currentPlaceholder && !nextPlaceholder) {
    return true;
  }
  if (!currentPlaceholder && nextPlaceholder) {
    return false;
  }
  return currentThumbnail !== nextThumbnail;
}
