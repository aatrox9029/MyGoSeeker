import { fetchWithRetry } from "../network/fetch-retry.js";
import { throwIfAborted } from "../tasks/operation-control.js";

// Keys live only in this download's memory; checkpoints contain decrypted media.
export function createSegmentDecryptor(options = {}) {
  const keys = new Map();
  return async function decryptSegment(item, bytes) {
    const encryption = item.encryption;
    if (!encryption) return bytes;
    throwIfAborted(options.signal);
    const log = (level, message, details) => options.logger?.(level, "hls-decrypt", message, {
      kind: item.kind, index: item.index, method: encryption.method, ...details
    });
    try {
      if (encryption.method !== "AES-128" || !/^[0-9a-f]{32}$/i.test(encryption.iv)) throw new Error("Invalid AES-128 encryption descriptor");
      if (!bytes.byteLength || bytes.byteLength % 16) throw new Error("AES-128 segment length must be a multiple of 16 bytes");
      const cacheKey = JSON.stringify([encryption.url, encryption.id]);
      if (!keys.has(cacheKey)) {
        keys.set(cacheKey, (async () => {
          log("info", "Fetching AES-128 key");
          let keyBytes;
          try {
            keyBytes = await fetchWithRetry(encryption.url, "arrayBuffer", {
              ...options, byteRange: undefined, maxBytes: 16, allowText: true, stage: "HLS key fetch"
            });
          } catch (error) {
            throwIfAborted(options.signal);
            if (/safe buffer limit/.test(error.message)) throw new Error("HLS AES-128 key must contain exactly 16 bytes");
            throw new Error(`HLS key request failed: ${error.message}`);
          }
          if (keyBytes.byteLength !== 16) throw new Error("HLS AES-128 key must contain exactly 16 bytes");
          try { return await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, ["decrypt"]); }
          finally { new Uint8Array(keyBytes).fill(0); }
        })());
      }
      const key = await keys.get(cacheKey);
      throwIfAborted(options.signal);
      const iv = Uint8Array.from(encryption.iv.match(/../g), (hex) => parseInt(hex, 16));
      let decrypted;
      try { decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, bytes); }
      catch { throw new Error("AES-128 decryption failed; the key, IV or segment content is invalid. Refresh the source and retry."); }
      throwIfAborted(options.signal);
      log("info", "Decrypted AES-128 segment", { bytes: decrypted.byteLength });
      return decrypted;
    } catch (error) {
      throwIfAborted(options.signal);
      log("error", "HLS decryption failed", { error: error.message });
      throw error;
    }
  };
}
