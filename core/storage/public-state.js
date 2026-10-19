export function compactPublicState(data, known = {}) {
  const versions = {}, cards = [];
  for (const card of data.cards) {
    const { debugReport, ...visible } = card;
    // Fingerprint includes discoveries/history changes as well as progress updates.
    const serialized = JSON.stringify(visible);
    let hash = 2166136261;
    for (let i = 0; i < serialized.length; i++) hash = Math.imul(hash ^ serialized.charCodeAt(i), 16777619);
    const version = `${card.updatedAt}:${hash >>> 0}`;
    versions[card.id] = version;
    if (known[card.id] !== version) cards.push(visible);
  }
  return { ...data, cards, versions, removed: Object.keys(known).filter((id) => !(id in versions)), delta: true };
}
