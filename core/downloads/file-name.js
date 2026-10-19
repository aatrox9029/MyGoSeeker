export function formatDownloadFileName(card, variant, extension, rule = "{title}") {
  const values = { title: card.title || "video", quality: variant.label || "auto", date: new Date().toISOString().slice(0, 10), id: card.id };
  const name = String(rule || "{title}").replace(/\{(title|quality|date|id)\}/g, (_, key) => values[key])
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 160) || "video";
  return `${/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name) ? "_" : ""}${name}.${extension}`;
}
