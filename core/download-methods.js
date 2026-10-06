const METHOD_FAMILIES = new Set(["network", "record"]);

export function normalizeMethodFamily(methodFamily) {
  if (typeof methodFamily !== "string") {
    return "network";
  }
  const normalized = methodFamily.trim().toLowerCase();
  return METHOD_FAMILIES.has(normalized) ? normalized : "network";
}

export function getMethodFamilyLabel(methodFamily) {
  return normalizeMethodFamily(methodFamily) === "record" ? "Record" : "Network";
}

export function getVariantMethodFamily(variant) {
  if (variant?.methodFamily) {
    return normalizeMethodFamily(variant.methodFamily);
  }
  if (variant?.isBlob) {
    return "network";
  }
  return "network";
}

export function expandCandidateDownloadMethods(candidate, detectedType) {
  if (detectedType === "blob") {
    return [
      {
        ...candidate,
        methodFamily: "network"
      },
      {
        ...candidate,
        methodFamily: "record"
      }
    ];
  }
  return [
    {
      ...candidate,
      methodFamily: "network"
    }
  ];
}

export function buildVariantMethodOptionLabel(variant, fallbackLabel = "") {
  const methodLabel = getMethodFamilyLabel(getVariantMethodFamily(variant));
  const variantLabel = typeof variant?.label === "string" && variant.label.trim()
    ? variant.label.trim()
    : fallbackLabel.trim();
  if (!variantLabel) {
    return methodLabel;
  }
  return `${methodLabel} - ${variantLabel}`;
}

export function getDownloadModeDisplayLabel(downloadMode) {
  const value = typeof downloadMode === "string" ? downloadMode.trim().toLowerCase() : "";
  if (!value) {
    return "";
  }
  if (value.includes("record")) {
    return "Record";
  }
  return "Network";
}
