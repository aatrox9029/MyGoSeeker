export function getVariantById(card, variantId) {
  if (!card || !Array.isArray(card.variants)) {
    return null;
  }
  return card.variants.find((variant) => variant.id === variantId) || null;
}
