export function arrayBufferToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

async function sendToTabWithAck(tabId, type, payload) {
  const response = await chrome.tabs.sendMessage(tabId, {
    type,
    payload
  });
  if (!response || response.ok !== true) {
    throw new Error(response?.error || `Tab handler failed for ${type}`);
  }
  return response;
}

export async function startBinaryTransfer(tabId, transferId, filename, mimeType) {
  await sendToTabWithAck(tabId, "START_BINARY_SAVE", {
    transferId,
    filename,
    mimeType
  });
}

export async function appendBinaryTransferChunk(tabId, transferId, chunkBase64) {
  await sendToTabWithAck(tabId, "APPEND_BINARY_CHUNK", {
    transferId,
    chunkBase64
  });
}

export async function sendArrayBufferToTransfer(tabId, transferId, arrayBuffer, chunkSize) {
  if (!Number.isInteger(chunkSize) || chunkSize < 4) throw new Error("Invalid transfer chunk size");
  const bytesPerChunk = Math.floor(chunkSize / 4) * 3;
  for (let offset = 0; offset < arrayBuffer.byteLength; offset += bytesPerChunk) {
    await appendBinaryTransferChunk(tabId, transferId, arrayBufferToBase64(arrayBuffer.slice(offset, offset + bytesPerChunk)));
  }
}

export async function finishBinaryTransfer(tabId, transferId) {
  await sendToTabWithAck(tabId, "FINISH_BINARY_SAVE", {
    transferId
  });
}

export async function abortBinaryTransfer(tabId, transferId) {
  try {
    await sendToTabWithAck(tabId, "ABORT_BINARY_SAVE", { transferId });
  } catch {
    // Ignore abort failure.
  }
}
