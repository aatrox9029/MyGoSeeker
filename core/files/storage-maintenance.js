import { scanBinaryJobs } from "./binary-store.js";
export const MAX_STORED_BYTES = 512 * 1024 * 1024;
export const TEMP_TTL = 7 * 24 * 60 * 60 * 1000;
export async function ensureStorageSpace(bytes, estimate = () => globalThis.navigator?.storage?.estimate?.()) {
  const info = await estimate();
  if (info?.quota && info.quota - (info.usage || 0) < bytes + 16 * 1024 * 1024) {
    throw new Error("Insufficient storage space. Free disk space or clear inactive downloads.");
  }
}
export async function collectTemporaryFiles(cards, now = Date.now()) {
  if (!globalThis.indexedDB) return { removed: 0, bytes: 0 };
  const active = Object.values(cards).filter((card) => ["queued", "downloading", "paused"].includes(card.status));
  const prefixes = active.filter((card) => card.status !== "paused" || now - card.updatedAt < TEMP_TTL).map((card) => `hls:${card.id}:`);
  const jobs = new Set(active.filter((card) => card.status === "downloading").map((card) => card.id));
  return scanBinaryJobs((key, value) => {
    if (String(key).startsWith("hls:")) return !prefixes.some((prefix) => key.startsWith(prefix));
    if (value?.cardId && jobs.has(value.cardId)) return false;
    return !value?.updatedAt || now - value.updatedAt > 60 * 60 * 1000;
  });
}
