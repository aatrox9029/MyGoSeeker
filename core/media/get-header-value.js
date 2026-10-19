export function getHeaderValue(headers, name) {
  if (!Array.isArray(headers)) {
    return "";
  }
  const target = String(name || "").toLowerCase();
  const entry = headers.find((item) => String(item?.name || "").toLowerCase() === target);
  return typeof entry?.value === "string" ? entry.value : "";
}
