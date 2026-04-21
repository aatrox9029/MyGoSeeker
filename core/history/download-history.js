const HISTORY_PROTOCOLS = new Set(["http:", "https:"]);

export function isDownloadHistoryEnabled(settings) {
  return settings?.downloadHistoryEnabled !== false;
}

export function normalizeDownloadHistoryUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    if (!HISTORY_PROTOCOLS.has(url.protocol)) {
      return "";
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

export function recordDownloadedUrl(historyEntries, rawUrl) {
  const normalizedUrl = normalizeDownloadHistoryUrl(rawUrl);
  if (!normalizedUrl) {
    return Array.isArray(historyEntries) ? [...historyEntries] : [];
  }

  const nextEntries = Array.isArray(historyEntries) ? [...historyEntries] : [];
  if (!nextEntries.includes(normalizedUrl)) {
    nextEntries.push(normalizedUrl);
  }
  return nextEntries;
}

export function cardHasDownloadedHistory(card, historyEntries, settings) {
  if (!isDownloadHistoryEnabled(settings) || !card || !Array.isArray(card.variants)) {
    return false;
  }

  const historySet = new Set(Array.isArray(historyEntries) ? historyEntries : []);
  for (const variant of card.variants) {
    if (!variant || typeof variant.url !== "string") {
      continue;
    }
    const normalizedUrl = normalizeDownloadHistoryUrl(variant.url);
    if (normalizedUrl && historySet.has(normalizedUrl)) {
      return true;
    }
  }
  return false;
}

export function applyDownloadHistory(cards, historyEntries, settings) {
  return (Array.isArray(cards) ? cards : []).map((card) => ({
    ...card,
    isPreviouslyDownloaded: cardHasDownloadedHistory(card, historyEntries, settings)
  }));
}
