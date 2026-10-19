import { hashString } from "./hash-string.js";
import { normalizeMethodFamily } from "../download-methods.js";
export function ensureVariantMethodCoverage(variants) {
  if (!Array.isArray(variants) || variants.length === 0) {
    return { variants: [], changed: false };
  }
  const result = [];
  const seenBlobKeys = new Set();
  let changed = false;

  for (const variant of variants) {
    if (!variant) {
      continue;
    }
    if (variant.type === "blob") {
      const blobKey = `${variant.url}|${variant.type}|${variant.source || "unknown"}`;
      if (seenBlobKeys.has(blobKey)) {
        changed = true;
        continue;
      }
      seenBlobKeys.add(blobKey);
      const families = ["network", "record"];
      for (const methodFamily of families) {
        const nextVariant = {
          ...variant,
          id: `variant_${hashString(`${blobKey}|${methodFamily}`)}`,
          methodFamily
        };
        result.push(nextVariant);
      }
      const blobFamilyCount = variants.filter((item) => item?.type === "blob" && `${item.url}|${item.type}|${item.source || "unknown"}` === blobKey).length;
      if (blobFamilyCount !== 2 || !variants.some((item) => item?.type === "blob" && item?.methodFamily === "record" && `${item.url}|${item.type}|${item.source || "unknown"}` === blobKey)) {
        changed = true;
      }
      continue;
    }
    const nextFamily = normalizeMethodFamily(variant.methodFamily);
    if (nextFamily !== variant.methodFamily) {
      changed = true;
    }
    result.push({
      ...variant,
      methodFamily: nextFamily
    });
  }

  return { variants: result, changed };
}
