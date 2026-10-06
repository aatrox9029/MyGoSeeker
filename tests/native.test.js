import test from "node:test";
import assert from "node:assert/strict";
import { ensureNativePort, isNativeHostConnected } from "../extension/background/native-port.js";
import { createNativePortMessageHandler } from "../extension/background/native-events.js";
import { EVENT_TYPES } from "../shared/protocol.js";

function event() {
  const listeners = new Set();
  return { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn), emit: (value) => [...listeners].forEach((fn) => fn(value)) };
}
test("native availability requires READY and concurrent callers share the port", async () => {
  let connections = 0;
  const port = { onMessage: event(), onDisconnect: event(), postMessage() {}, disconnect() {} };
  globalThis.chrome = { runtime: { connectNative: () => { connections++; return port; } } };
  const first = ensureNativePort(), second = ensureNativePort();
  assert.equal(isNativeHostConnected(), false);
  port.onMessage.emit({ type: "READY" });
  assert.equal(await first, port); assert.equal(await second, port);
  assert.equal(connections, 1); assert.equal(isNativeHostConnected(), true);
  port.onDisconnect.emit();
  assert.equal(isNativeHostConnected(), false);
  const failing = { onMessage: event(), onDisconnect: event(), postMessage() { queueMicrotask(() => failing.onDisconnect.emit()); }, disconnect() {} };
  chrome.runtime.connectNative = () => failing;
  await assert.rejects(ensureNativePort(true), /disconnected/i);
  assert.equal(isNativeHostConnected(), false);
});
test("native job failure/disconnect invokes extension fallback", async () => {
  const card = { id: "c", nativeJobId: "j", status: "downloading" };
  const fallbacks = [];
  const handler = createNativePortMessageHandler({ EVENT_TYPES,
    getStateCards: () => [card], findCardByNativeJobId: (id) => id === "j" ? card : null,
    setCardStatus: async () => {}, requestNativeReport: async () => {},
    fallbackNativeDownload: async (item, message) => fallbacks.push([item.id, message.type])
  });
  await handler({ type: EVENT_TYPES.JOB_FAILED, jobId: "j", message: "403" });
  await handler({ type: "NATIVE_HOST_DISCONNECTED" });
  assert.deepEqual(fallbacks, [["c", "JOB_FAILED"], ["c", "NATIVE_HOST_DISCONNECTED"]]);
});
