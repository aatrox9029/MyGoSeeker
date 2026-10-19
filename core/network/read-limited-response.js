export async function readLimitedResponse(response, maxBytes) {
  const length = Number(response.headers.get("content-length"));
  if (length > maxBytes) {
    await response.body?.cancel();
    throw new Error("Media resource exceeds the safe buffer limit");
  }
  if (!response.body?.getReader) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new Error("Media resource exceeds the safe buffer limit");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Media resource exceeds the safe buffer limit");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result.buffer;
}
