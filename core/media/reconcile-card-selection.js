import { chooseBestVariant } from "./choose-best-variant.js";
export function reconcileCardSelection(card) {
  if (!card || !Array.isArray(card.variants) || card.variants.length === 0) {
    return false;
  }
  if (["queued", "downloading", "paused"].includes(card.status)) return false;
  const selectedStillExists = card.variants.some((variant) => variant.id === card.selectedVariantId);
  if (card.selectedVariantId && selectedStillExists && card.selectionLocked) {
    return false;
  }
  const bestVariant = chooseBestVariant(card.variants);
  if (!bestVariant || card.selectedVariantId === bestVariant.id) {
    return false;
  }
  card.selectedVariantId = bestVariant.id;
  return true;
}
