export function createMediaDebugLog(context = {}) {
  return {
    id: context.id || `debug_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    context: {
      cardId: context.cardId || "",
      title: context.title || "",
      pageUrl: context.pageUrl || "",
      variantUrl: context.variantUrl || "",
      variantLabel: context.variantLabel || "",
      sourceType: context.sourceType || ""
    },
    status: "running",
    mode: "",
    entries: [],
    summary: {}
  };
}

export function addDebugEntry(log, level, stage, message, details = undefined) {
  if (!log) {
    return log;
  }
  log.entries.push({
    at: Date.now(),
    level,
    stage,
    message,
    details: sanitizeDetails(details)
  });
  if (log.entries.length > 1000) log.entries.splice(0, log.entries.length - 1000);
  log.updatedAt = Date.now();
  return log;
}

export function setDebugSummary(log, summary = {}) {
  if (!log) {
    return log;
  }
  log.summary = {
    ...log.summary,
    ...sanitizeDetails(summary)
  };
  log.updatedAt = Date.now();
  return log;
}

export function finalizeDebugLog(log, status, summary = {}) {
  if (!log) {
    return log;
  }
  log.status = status;
  return setDebugSummary(log, summary);
}

function sanitizeDetails(details) {
  if (details == null) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(details));
}
