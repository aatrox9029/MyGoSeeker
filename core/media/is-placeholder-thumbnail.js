export function isPlaceholderThumbnail(thumbnail) {
  return typeof thumbnail === "string" && thumbnail.startsWith("data:image/svg+xml;base64,");
}
