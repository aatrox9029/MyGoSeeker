import { fetchWithRetry } from "../network/fetch-retry.js";

export function createRetryFetchLogger(debugLog, addDebugEntry) {
  return (level, stage, message, details) => addDebugEntry(debugLog, level, stage, message, details);
}

export async function fetchTextWithRetry(url, options = {}) {
  return fetchWithRetry(url, "text", options);
}

export async function downloadMediaPlaylistResources(playlist, options = {}) {
  const entries = [
    ...(playlist?.initSegments || (playlist?.initSegment ? [playlist.initSegment] : [])).map((item, index) => ({ ...item, kind: "init", index })),
    ...(playlist?.segments || []).map((item, index) => ({ ...item, kind: "segment", index }))
  ];
  const resources = new Array(entries.length);
  const concurrency = Math.min(8, Math.max(1, Math.floor(options.concurrency || 4)));
  let next = 0;
  let completed = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (!failure && next < entries.length) {
      const index = next++;
      const item = entries[index];
      try {
        resources[index] = {
          ...item, sourceUrl: item.url,
          bytes: await fetchWithRetry(item.url, "arrayBuffer", {
            ...options, byteRange: item.byteRange,
            stage: `${options.stagePrefix || "playlist"} ${item.kind}`
          })
        };
        options.onProgress?.(++completed, entries.length);
      } catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
  return resources;
}
