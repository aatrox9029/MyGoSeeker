export function filterAndSortCards(cards, search = "", sort = "newest") {
  const query = search.trim().toLocaleLowerCase();
  return cards.filter((card) => !query || `${card.title} ${card.pageTitle} ${card.variants.map((variant) => variant.label).join(" ")}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => sort === "title" ? String(a.title).localeCompare(String(b.title)) : sort === "progress" ? (b.progress || 0) - (a.progress || 0) : (b.createdAt || 0) - (a.createdAt || 0));
}
export function formatTransferStats(card) {
  if (!card.speed) return "";
  const speed = card.speed >= 1024 * 1024 ? `${(card.speed / 1024 / 1024).toFixed(1)} MiB/s` : `${Math.round(card.speed / 1024)} KiB/s`;
  return `${speed}${Number.isFinite(card.eta) ? ` · ~${Math.ceil(Math.max(0, card.eta))}s` : ""}`;
}
