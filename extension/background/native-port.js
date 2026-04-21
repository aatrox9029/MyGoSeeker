import {
  NATIVE_HOST_NAME,
  REQUEST_TYPES,
  createRequestId
} from "../native/protocol.js";

let port = null;
let lastError = "";
const listeners = new Set();

function notify(message) {
  for (const listener of listeners) {
    try {
      listener(message);
    } catch {
      // Ignore listener failures so the port stays alive.
    }
  }
}

function resetPort() {
  port = null;
}

function bindPort(nextPort) {
  nextPort.onMessage.addListener((message) => {
    notify(message);
  });
  nextPort.onDisconnect.addListener(() => {
    const runtimeError = chrome.runtime.lastError;
    lastError = runtimeError?.message || "Native host disconnected";
    notify({
      type: "NATIVE_HOST_DISCONNECTED",
      error: lastError
    });
    resetPort();
  });
}

export function addNativePortListener(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNativeHostError() {
  return lastError;
}

export function isNativeHostConnected() {
  return Boolean(port);
}

export async function ensureNativePort() {
  if (port) {
    return port;
  }

  try {
    const nextPort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    bindPort(nextPort);
    port = nextPort;
    lastError = "";
    nextPort.postMessage({
      type: REQUEST_TYPES.HELLO,
      requestId: createRequestId("hello")
    });
    return port;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

export async function sendNativeCommand(message) {
  const activePort = await ensureNativePort();
  activePort.postMessage(message);
}
