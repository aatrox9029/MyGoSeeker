import { getBinaryJob, putBinaryJob, deleteBinaryPrefix } from "../files/binary-store.js";
import { throwIfAborted } from "../tasks/operation-control.js";
import { ensureStorageSpace } from "../files/storage-maintenance.js";

export const MAX_REMUX_BYTES = 256 * 1024 * 1024;
export const MAX_SEGMENT_BYTES = 16 * 1024 * 1024;
const checkpointPrefix = (cardId) => `hls:${cardId}:`;

export async function createSegmentCheckpoint(cardId, variantId, signal, maxBytes = MAX_REMUX_BYTES) {
  const prefix = `${checkpointPrefix(cardId)}${variantId}:`;
  let totalBytes = 0;
  const accounted = new Set();
  return {
    async prepare(entries, track, playlist) {
      const key = `${prefix}${track}:manifest`;
      const identity = JSON.stringify([playlist.baseUrl, playlist.mediaSequence, entries.map((item) => [item.url, item.byteRange, item.duration, item.encryption || null])]);
      const saved = await getBinaryJob(key);
      if (saved?.identity !== identity) await deleteBinaryPrefix(`${prefix}${track}:`);
      throwIfAborted(signal);
      await putBinaryJob(key, { identity, updatedAt: Date.now() });
    },
    async load(item, track) {
      throwIfAborted(signal);
      const key = `${prefix}${track}:${item.kind}:${item.index}`;
      const saved = await getBinaryJob(key);
      // Exact descriptors prevent mixing changed playlists, ranges, or expired signed URLs.
      const identity = JSON.stringify([item.url, item.byteRange || null, item.duration || 0, item.encryption || null]);
      if (!saved || saved.identity !== identity || !(saved.bytes instanceof ArrayBuffer)) return null;
      account(key, saved.bytes.byteLength);
      return { ...item, sourceUrl: item.url, storageKey: key, byteLength: saved.bytes.byteLength };
    },
    async save(item, bytes, track) {
      throwIfAborted(signal);
      const key = `${prefix}${track}:${item.kind}:${item.index}`;
      account(key, bytes.byteLength);
      await ensureStorageSpace(bytes.byteLength);
      await putBinaryJob(key, { identity: JSON.stringify([item.url, item.byteRange || null, item.duration || 0, item.encryption || null]), bytes, updatedAt: Date.now() });
      return { ...item, sourceUrl: item.url, storageKey: key, byteLength: bytes.byteLength };
    },
    get totalBytes() { return totalBytes; }
  };
  function account(key, size) {
    if (accounted.has(key)) return;
    if (size > MAX_SEGMENT_BYTES || totalBytes + size > maxBytes) {
      throw new Error(`Stream exceeds the safe browser remux limit (${Math.round(maxBytes / 1024 / 1024)} MiB). Use a smaller quality or enable Native helper for direct/HLS downloads.`);
    }
    accounted.add(key);
    totalBytes += size;
  }
}

export const clearSegmentCheckpoint = (cardId) => deleteBinaryPrefix(checkpointPrefix(cardId));

export async function readSegmentResource(resource) {
  if (resource.bytes) return resource.bytes;
  const saved = await getBinaryJob(resource.storageKey);
  if (!(saved?.bytes instanceof ArrayBuffer)) throw new Error("Saved HLS segment is missing. Retry the download.");
  return saved.bytes;
}
