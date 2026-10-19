import test from "node:test";
import assert from "node:assert/strict";
import { recoverDownloads } from "../extension/background/recover-downloads.js";
import { createOperationRegistry } from "../core/tasks/operation-control.js";
import { createDownloadControls } from "../extension/background/download-controls.js";
import { retainDownloadTask } from "../core/history/retain-download-task.js";

test("startup reconciles completion, browser pause, interrupted HLS, and lost recordings", async () => {
  const cards = {
    completed: { id: "c", status: "downloading", activeDownloadId: 1 },
    browser: { id: "b", status: "downloading", activeDownloadId: 2 },
    hls: { id: "h", status: "downloading", selectedVariantId: "v", variants: [{ id: "v", isM3u8: true }] },
    recording: { id: "r", status: "downloading", selectedVariantId: "v", variants: [{ id: "v", isBlob: true }] }
  };
  let recovered;
  assert.ok(await recoverDownloads(cards, { downloads: { search: async ({ id }) => [id === 1 ? { state: "complete" } : { state: "in_progress", paused: true, totalBytes: 100, bytesReceived: 50 }] },
    tabs: { sendMessage: async () => ({ active: false }) }, isVideo: () => true, recoverRemux: async (id) => { recovered = id; } }));
  assert.equal(cards.completed.status, "completed");
  assert.equal(cards.browser.status, "paused");
  assert.equal(cards.browser.progress, 50);
  assert.equal(cards.hls.status, "paused");
  assert.equal(recovered, "h");
  assert.equal(cards.recording.status, "error");
  assert.ok(retainDownloadTask(cards.hls));
});

test("pause waits for work to settle before resume; controls never start fallback downloads", async () => {
  const operations = createOperationRegistry();
  const card = { id: "h", status: "downloading", selectedVariantId: "v", variants: [{ id: "v" }] };
  let resumed = 0;
  const control = createDownloadControls({ getCard: () => card, operations, setCardStatus: async (_id, patch) => Object.assign(card, patch),
    startDownload: async () => { resumed++; card.status = "downloading"; }, getCardDebugLog: () => null, activeDownloads: new Map() });
  const operation = operations.begin("h");
  operation.controller.signal.addEventListener("abort", () => setTimeout(() => operation.finish(), 5));
  await control("h", "pause");
  assert.equal(operations.get("h"), undefined);
  assert.equal(card.status, "paused");
  await control("h", "resume");
  assert.equal(resumed, 1);
  await control("h", "cancel");
  assert.equal(card.status, "available");
  assert.equal(resumed, 1);
});

test("browser and content controls use their own backends", async () => {
  const actions = [];
  globalThis.chrome = { downloads: { pause: async (id) => actions.push(["pause", id]), resume: async (id) => actions.push(["resume", id]), cancel: async (id) => actions.push(["cancel", id]) },
    tabs: { sendMessage: async (_id, message) => { actions.push(["content", message.action]); return { ok: true }; } } };
  const card = { id: "b", tabId: 1, status: "downloading", activeDownloadId: 3, selectedVariantId: "v", variants: [{ id: "v", isBlob: true }] };
  const control = createDownloadControls({ getCard: () => card, operations: createOperationRegistry(), setCardStatus: async (_id, patch) => Object.assign(card, patch), getCardDebugLog: () => null, activeDownloads: new Map() });
  await control("b", "pause"); await control("b", "resume"); await control("b", "cancel");
  card.status = "downloading";
  await control("b", "pause"); await control("b", "resume"); await control("b", "cancel");
  assert.deepEqual(actions, [["pause", 3], ["resume", 3], ["cancel", 3], ["content", "pause"], ["content", "resume"], ["content", "cancel"]]);
});
