async function handleStartM3u8Save(payload) {
  const { transferId, filename, mimeType } = payload || {};
  if (!transferId || typeof transferId !== "string") {
    return { ok: false, error: "Missing transferId" };
  }
  if (!filename || typeof filename !== "string") {
    return { ok: false, error: "Invalid filename for m3u8 save" };
  }
  binaryTransfers.set(transferId, {
    filename,
    mimeType: typeof mimeType === "string" && mimeType ? mimeType : "application/octet-stream",
    chunks: []
  });
  return { ok: true };
}

async function handleAppendM3u8Chunk(payload) {
  const { transferId, chunkBase64 } = payload || {};
  if (!transferId || typeof transferId !== "string") {
    return { ok: false, error: "Missing transferId" };
  }
  if (!chunkBase64 || typeof chunkBase64 !== "string") {
    return { ok: false, error: "Invalid m3u8 chunk payload" };
  }
  const transfer = binaryTransfers.get(transferId);
  if (!transfer) {
    return { ok: false, error: "M3U8 transfer not found" };
  }
  transfer.chunks.push(base64ToUint8Array(chunkBase64));
  return { ok: true };
}

async function handleFinishM3u8Save(payload) {
  const { transferId } = payload || {};
  if (!transferId || typeof transferId !== "string") {
    return { ok: false, error: "Missing transferId" };
  }
  const transfer = binaryTransfers.get(transferId);
  if (!transfer) {
    return { ok: false, error: "M3U8 transfer not found" };
  }
  try {
    const blob = new Blob(transfer.chunks, { type: transfer.mimeType });
    downloadBlobToFile(blob, transfer.filename);
    binaryTransfers.delete(transferId);
    return { ok: true };
  } catch (error) {
    binaryTransfers.delete(transferId);
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function handleAbortM3u8Save(payload) {
  const { transferId } = payload || {};
  if (transferId && typeof transferId === "string") {
    binaryTransfers.delete(transferId);
  }
  return { ok: true };
}

