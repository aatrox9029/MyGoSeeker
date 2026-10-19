import test from "node:test";
import assert from "node:assert/strict";
import { ensureNativePort, isNativeHostConnected } from "../extension/background/native-port.js";
import { createNativePortMessageHandler } from "../extension/background/native-events.js";
import { EVENT_TYPES } from "../shared/protocol.js";
import { createSetupReleaseController } from "../extension/background/setup-release.js";
import { buildNativeJob } from "../extension/native/normalize-job.js";

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

test("optional helper does not connect when disabled; enabled failures offer separate release", async () => {
  let enabled = false, calls = 0;
  const controller = createSetupReleaseController({ isEnabled: () => enabled, isNativeHostConnected: () => false,
    ensureNativePort: async () => { calls++; throw new Error("not installed"); } });
  const disabled = await controller.getSetupState(true);
  assert.equal(disabled.nativeHelperEnabled, false);
  assert.equal(calls, 0);
  enabled = true;
  const missing = await controller.getSetupState(true);
  assert.equal(calls, 1);
  assert.equal(missing.showDownload, true);
  assert.equal(missing.nativeHelperBundled, true);
  assert.match(missing.releasesPageUrl, /^https:\/\/github.com\//);
});

test("native job includes selected HLS alternate audio", () => {
  const job = buildNativeJob({ card: { id: "card", title: "video" },
    variant: { id: "v", url: "https://media.example/video.m3u8", isM3u8: true, audioUrl: "https://media.example/audio.m3u8" }, requestContext: {} });
  assert.equal(job.audioUrl, "https://media.example/audio.m3u8");
  assert.equal(job.sourceType, "hls");
});

test("paused native tasks clear their dead connection through fallback", async () => {
  const card = { id: "paused", nativeJobId: "j", status: "paused" };
  let calls = 0;
  const handler = createNativePortMessageHandler({ EVENT_TYPES, getStateCards: () => [card],
    findCardByNativeJobId: () => card, fallbackNativeDownload: async () => { calls++; card.nativeJobId = ""; } });
  await handler({ type: "NATIVE_HOST_DISCONNECTED" });
  assert.equal(calls, 1);
  assert.equal(card.status, "paused");
});
