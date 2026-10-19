export function createCardMerger({ getState, normalizeTitleForGrouping, retainDownloadTask, shouldReplaceThumbnail, dedupeVariantsBySimilarity, reconcileCardSelection }) {
  return function mergeCardsBySameTitle(tabId, pageUrl) {
  if (!pageUrl) {
    return false;
  }
  const candidates = Object.values(getState().cards).filter((card) => {
    return card.tabId === tabId
      && card.pageUrl === pageUrl
      && !card.ignored
      && !retainDownloadTask(card)
      && Array.isArray(card.variants)
      && card.variants.length > 0;
  });
  if (candidates.length < 2) {
    return false;
  }

  const groups = new Map();
  for (const card of candidates) {
    const titleKey = normalizeTitleForGrouping(card.title || card.pageTitle || "");
    if (!titleKey) {
      continue;
    }
    if (card.identityKey) {
      continue;
    }
    const key = `${tabId}|${pageUrl}|${card.mediaKey || ""}|${titleKey}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(card);
  }

  let changed = false;
  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    group.sort((a, b) => b.updatedAt - a.updatedAt);
    const primary = group[0];
    const others = group.slice(1);

    for (const secondary of others) {
      for (const variant of secondary.variants) {
        if (!primary.variants.some((item) => item.id === variant.id)) {
          primary.variants.push(variant);
        }
      }
      if (shouldReplaceThumbnail(primary.thumbnail, secondary.thumbnail)) {
        primary.thumbnail = secondary.thumbnail;
      }
      delete getState().cards[secondary.id];
      changed = true;
    }

    const deduped = dedupeVariantsBySimilarity(primary.variants);
    if (deduped.changed) {
      primary.variants = deduped.variants;
      changed = true;
    }
    if (reconcileCardSelection(primary)) {
      changed = true;
    }
    primary.updatedAt = Date.now();
  }
  return changed;
};
}
