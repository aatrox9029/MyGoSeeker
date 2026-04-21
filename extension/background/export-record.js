export async function exportCardRecord({
  card,
  ensureInitialized,
  requestNativeReport,
  getCardDebugLog,
  buildDebugReport,
  createMediaDebugLog,
  sanitizeFileName,
  chromeDownloads
}) {
  await ensureInitialized();
  if (card.nativeJobId && !card.debugReport) {
    await requestNativeReport(card.nativeJobId);
    await ensureInitialized();
  }

  const debugLog = getCardDebugLog(card);
  const content = card.debugReport || buildDebugReport({
    card,
    log: debugLog || createMediaDebugLog({
      cardId: card.id,
      title: card.title,
      pageUrl: card.pageUrl
    }),
    extraNotes: [
      "No structured remux log was captured for this record. Variant URLs are included below.",
      ...(Array.isArray(card.variants) ? card.variants.map((variant) => `${variant.type}: ${variant.url}`) : [])
    ]
  });

  const safeTitle = sanitizeFileName(card.title || "download").slice(0, 50);
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${safeTitle}_debug_${timestamp}.md`;
  const encodedContent = encodeURIComponent(content);
  const dataUrl = `data:text/markdown;charset=utf-8,${encodedContent}`;

  await chromeDownloads.download({
    url: dataUrl,
    filename,
    saveAs: false,
    conflictAction: "uniquify"
  });
}
