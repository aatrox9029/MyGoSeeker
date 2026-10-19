import { MAX_REMUX_BYTES } from "../hls/segment-checkpoint.js";
export function checkEstimatedStreamSize(bytes, logger) {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  logger?.("info", "memory", "Estimated stream size before download", { bytes, limit: MAX_REMUX_BYTES, estimated: true });
  if (bytes > MAX_REMUX_BYTES) throw new Error("Estimated stream size exceeds safe browser remux limit (256 MiB). Select a smaller quality or enable Native helper for direct/HLS.");
}
