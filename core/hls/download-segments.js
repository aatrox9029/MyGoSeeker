import { fetchWithRetry } from "../network/fetch-retry.js";
import { throwIfAborted } from "../tasks/operation-control.js";
import { createSegmentDecryptor } from "./create-segment-decryptor.js";
import { createAdaptiveConcurrency } from "../network/adaptive-concurrency.js";
import { abortableDelay } from "../tasks/operation-control.js";

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
  const decrypt = createSegmentDecryptor(options);
  await options.checkpoint?.prepare(entries, options.stagePrefix, playlist);
  const concurrency = Math.min(8, Math.max(1, Math.floor(options.concurrency || 4)));
  const adaptive = createAdaptiveConcurrency(concurrency);
  let inFlight = 0;
  let next = 0;
  let completed = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (!failure && next < entries.length) {
      while (!failure && inFlight >= adaptive.limit) await abortableDelay(25, options.signal);
      if (failure || next >= entries.length) break;
      inFlight++;
      const startedAt = Date.now();
      const index = next++;
      const item = entries[index];
      try {
        throwIfAborted(options.signal);
        const cached = await options.checkpoint?.load(item, options.stagePrefix);
        if (cached) {
          resources[index] = cached;
          options.logger?.("info", "checkpoint", "Reusing saved segment", { kind: item.kind, index: item.index, bytes: cached.byteLength });
        } else {
          const encryptedBytes = await fetchWithRetry(item.url, "arrayBuffer", {
            ...options, byteRange: item.byteRange,
            stage: `${options.stagePrefix || "playlist"} ${item.kind}`
          });
          const bytes = await decrypt(item, encryptedBytes);
          resources[index] = options.checkpoint
            ? await options.checkpoint.save(item, bytes, options.stagePrefix)
            : { ...item, sourceUrl: item.url, bytes };
        }
        if (item.encryption) resources[index].decrypted = true;
        options.onProgress?.(++completed, entries.length);
        adaptive.observe(false, Date.now() - startedAt);
      } catch (error) { adaptive.observe(true, Date.now() - startedAt); failure = error; }
      finally { inFlight--; }
    }
  }));
  if (failure) throw failure;
  return resources;
}
