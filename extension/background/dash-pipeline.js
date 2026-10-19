import { fetchWithRetry } from "../../core/network/fetch-retry.js";
import { parseMpd } from "../../core/dash/parse-mpd.js";
import { createSegmentCheckpoint, MAX_SEGMENT_BYTES } from "../../core/hls/segment-checkpoint.js";
import { createRetryFetchLogger } from "../../core/hls/download-segments.js";
import { createStreamFinalizer } from "./finalize-stream.js";
import { addDebugEntry, finalizeDebugLog } from "../../core/debug/media-debug-log.js";
import { buildDebugReport } from "../../core/debug/export-debug-report.js";
import { downloadDashPresentation } from "../../core/dash/download-presentation.js";
export function createDashDownloader(deps) {
  const finalize = createStreamFinalizer(deps);
  return async function downloadDash(card, variant, signal) {
    const log = deps.getCardDebugLog(card) || deps.createCardDebugLog(card, variant);
    const logger = createRetryFetchLogger(log, addDebugEntry);
    try {
      let url = variant.url;
      const text = await fetchWithRetry(url, "text", { signal, logger, credentials: card.requestCredentials || "include", maxBytes: 2 * 1024 * 1024, onResponse: (response) => { url = response.url || url; } });
      const tracks = parseMpd(text, url);
      addDebugEntry(log, "info", "dash", "Parsed DASH presentation", { dynamic: tracks.dynamic, periods: [...new Set(tracks.map((track) => track.periodId))], tracks: tracks.length });
      const checkpoint = await createSegmentCheckpoint(card.id, variant.id, signal);
      await deps.setCardStatus(card.id, { status: "downloading", progress: 10, stage: "Downloading DASH segments", downloadMode: "remuxing-source", error: "" });
      const { video, audio } = await downloadDashPresentation(tracks, url, card.streamOptions || {}, { signal, logger, checkpoint, maxBytes: MAX_SEGMENT_BYTES,
        credentials: card.requestCredentials || "include",
        onProgress: (done, total) => deps.setCardStatus(card.id, { progress: 10 + done / total * 50, stage: `Downloading DASH segments ${done}/${total}`, bytesReceived: checkpoint.totalBytes }).catch(console.error) });
      await finalize({ card, variant, video, audio, codecs: [video.info.codecs, audio?.info.codecs].filter(Boolean).join(","), debugLog: log, signal });
    } catch (error) {
      addDebugEntry(log, "error", "dash", "DASH download failed", { error: error.message });
      await deps.setCardStatus(card.id, { debugReport: buildDebugReport({ card, log: finalizeDebugLog(log, "failed", { error: error.message }) }) });
      throw error;
    }
  };
}
