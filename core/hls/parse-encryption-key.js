export function parseEncryptionKey(attrs, baseUrl, id) {
  const method = (attrs.METHOD || "").toUpperCase();
  if (method === "NONE") return null;
  const keyFormat = attrs.KEYFORMAT || "identity";
  if (method !== "AES-128" || keyFormat !== "identity" || (attrs.KEYFORMATVERSIONS && attrs.KEYFORMATVERSIONS !== "1")) {
    throw new Error(`Unsupported HLS encryption / DRM (method ${method || "missing"}, format ${keyFormat}); only AES-128 identity is supported.`);
  }
  if (!attrs.URI) throw new Error("HLS AES-128 key URI is missing");
  const url = new URL(attrs.URI, baseUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("HLS key URI must use HTTP(S)");
  const iv = attrs.IV;
  if (iv && !/^0x[0-9a-f]{1,32}$/i.test(iv)) throw new Error("HLS AES-128 IV must be a 128-bit hexadecimal value");
  return { method, url: url.href, iv: iv ? iv.slice(2).padStart(32, "0").toLowerCase() : "", id };
}
