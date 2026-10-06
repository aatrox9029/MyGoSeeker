import {
  NATIVE_HOST_NAME,
  REQUEST_TYPES,
  createRequestId
} from "../native/protocol.js";

let port = null;
let lastError = "";
let ready = false;
let connectionPromise = null;
let retryAt = 0;
const listeners = new Set();

function notify(message) {
  for (const listener of listeners) {
    try {
      Promise.resolve(listener(message)).catch(console.error);
    } catch {
      // Ignore listener failures so the port stays alive.
    }
  }
}

function resetPort() {
  port = null;
  ready = false;
}

function bindPort(nextPort) {
  nextPort.onMessage.addListener((message) => {
    if (port !== nextPort) return;
    notify(message);
  });
  nextPort.onDisconnect.addListener(() => {
    if (port !== nextPort) return;
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
  return Boolean(port && ready);
}

export async function ensureNativePort(forceRefresh = false) {
  if (port && ready) {
    return port;
  }
  if (connectionPromise) return connectionPromise;
  if (!forceRefresh && Date.now() < retryAt) throw new Error(lastError || "Native host unavailable");
  connectionPromise = connectAndWait();
  try { return await connectionPromise; } finally { connectionPromise = null; }
}

async function connectAndWait() {
  try {
    const nextPort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    port = nextPort;
    bindPort(nextPort);
    lastError = "";
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        nextPort.onMessage.removeListener(onMessage);
        nextPort.onDisconnect.removeListener(onDisconnect);
      };
      const onMessage = (message) => {
        if (message?.type !== "READY") return;
        cleanup();
        ready = true;
        resolve();
      };
      const onDisconnect = () => { cleanup(); reject(new Error(lastError || "Native host disconnected")); };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Native host handshake timed out"));
      }, 4000);
      nextPort.onMessage.addListener(onMessage);
      nextPort.onDisconnect.addListener(onDisconnect);
      try {
        nextPort.postMessage({ type: REQUEST_TYPES.HELLO, requestId: createRequestId("hello") });
      } catch (error) { cleanup(); reject(error); }
    });
    retryAt = 0;
    return port;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    retryAt = Date.now() + 15000;
    const failedPort = port;
    resetPort();
    failedPort?.disconnect();
    throw error;
  }
}

export async function sendNativeCommand(message) {
  const activePort = await ensureNativePort();
  activePort.postMessage(message);
}
