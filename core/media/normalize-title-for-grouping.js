export function normalizeTitleForGrouping(title) {
  if (!title || typeof title !== "string") {
    return "";
  }
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}
