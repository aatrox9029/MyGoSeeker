export function getFileExtensionFromName(name) {
  if (!name || typeof name !== "string") {
    return "";
  }
  const clean = name.split("?")[0].split("#")[0];
  const dot = clean.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return clean.slice(dot + 1).toLowerCase();
}
