function inferMethodHint(variant) {
  if (variant?.isM3u8) {
    return "native-hls";
  }
  return "native-direct";
}

function inferSourceType(variant) {
  if (variant?.isM3u8) {
    return "hls";
  }
  return "direct";
}

export function buildNativeJob({ card, variant, requestContext }) {
  const safeTitle = typeof card?.title === "string" && card.title.trim()
    ? card.title.trim()
    : "video";
  const ext = variant?.isM3u8 ? "mp4" : (variant?.type || "mp4");

  return {
    jobId: `job_${card.id}_${Date.now()}`,
    cardId: card.id,
    variantId: variant.id,
    sourceType: inferSourceType(variant),
    pageUrl: requestContext.pageUrl || card.pageUrl || "",
    tabUrl: requestContext.tabUrl || card.pageUrl || "",
    mediaUrl: variant.url,
    methodHint: inferMethodHint(variant),
    outputName: `${safeTitle}.${ext === "m3u8" ? "mp4" : ext}`,
    selectedVariant: {
      label: typeof variant?.label === "string" ? variant.label : "",
      source: typeof variant?.source === "string" ? variant.source : "",
      score: Number.isFinite(variant?.score) ? variant.score : 0
    },
    requestContext,
    debug: {
      enableVerboseLog: true,
      saveProbeJson: true
    }
  };
}
