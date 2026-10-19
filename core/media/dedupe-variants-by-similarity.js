import { buildVariantSimilarityKey } from "./build-variant-similarity-key.js";
import { choosePreferredVariant } from "./choose-preferred-variant.js";
export function dedupeVariantsBySimilarity(variants) {
  const result = [];
  const keyToIndex = new Map();
  let changed = false;

  for (const variant of variants) {
    const key = buildVariantSimilarityKey(variant);
    if (!keyToIndex.has(key)) {
      keyToIndex.set(key, result.length);
      result.push(variant);
      continue;
    }
    const index = keyToIndex.get(key);
    const kept = result[index];
    const preferred = choosePreferredVariant(kept, variant);
    if (preferred !== kept) {
      result[index] = preferred;
    }
    changed = true;
  }

  return { variants: result, changed: changed || result.length !== variants.length };
}
