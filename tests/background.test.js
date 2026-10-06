import test from "node:test";
import assert from "node:assert/strict";

test("background preserves alternate sources, serializes initialization and respects cancellation", async () => {
  const handlers = {};
  const event = (name) => ({ addListener: (fn) => { handlers[name] = fn; } });
  let reads = 0, downloadCalls = 0;
  const stored = {};
  globalThis.chrome = {
    runtime: { onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message"),
      sendMessage: async () => {}, connectNative: () => { throw new Error("not installed"); } },
    storage: { local: { get: async () => { reads++; await new Promise((resolve) => setTimeout(resolve, 5)); return stored; },
      set: async (patch) => Object.assign(stored, structuredClone(patch)), clear: async () => {} } },
    tabs: { onUpdated: event("tabUpdated"), onRemoved: event("tabRemoved"), get: async () => ({ url: "https://page.example/video", title: "Test" }), sendMessage: async () => ({ ok: true }) },
    webRequest: { onCompleted: event("webCompleted"), onHeadersReceived: event("headers") },
    downloads: { onChanged: event("downloadChanged"), download: async () => ++downloadCalls,
      search: async () => [{ fileSize: 10, exists: true, mime: "video/mp4", filename: "test.mp4" }] }
  };
  await import("../background.js");
  const call = (message, sender = {}) => new Promise((resolve) => handlers.message(message, sender, resolve));
  await Promise.all([call({ type: "GET_SETTINGS" }), call({ type: "GET_SETTINGS" })]);
  assert.equal(reads, 1);
  const sender = { tab: { id: 1 } };
  await call({ type: "DETECTED_CANDIDATES", pageUrl: "https://page.example/video", candidates: [
    { url: "https://a.example/video.mp4?token=a", type: "mp4", identityKey: "one", label: "720p" },
    { url: "https://b.example/video.mp4?token=b", type: "mp4", identityKey: "one", label: "720p" }
  ] }, sender);
  let card = (await call({ type: "GET_STATE", activeTabId: 1 })).data.cards[0];
  assert.equal(card.variants.length, 2, "Same quality backup was incorrectly removed");
  assert.ok((await call({ type: "DOWNLOAD_CARD", cardId: card.id, variantId: card.selectedVariantId })).ok);
  assert.equal((await call({ type: "DOWNLOAD_CARD", cardId: card.id, variantId: card.selectedVariantId })).ok, false);
  assert.equal((await call({ type: "CLEAR_CACHE", keepSettings: true })).ok, false);
  await handlers.downloadChanged({ id: 1, state: { current: "interrupted" }, error: { current: "USER_CANCELED" } });
  card = (await call({ type: "GET_STATE", activeTabId: 1 })).data.cards[0];
  assert.equal(card.status, "available"); assert.equal(downloadCalls, 1);
  await call({ type: "DOWNLOAD_CARD", cardId: card.id, variantId: card.selectedVariantId });
  await handlers.downloadChanged({ id: 2, state: { current: "interrupted" }, error: { current: "NETWORK_FAILED" } });
  assert.equal(downloadCalls, 3, "Interrupted request did not try alternate source");
  await handlers.downloadChanged({ id: 3, state: { current: "complete" } });
  card = (await call({ type: "GET_STATE", activeTabId: 1 })).data.cards[0];
  assert.equal(card.status, "completed");
  assert.match(card.debugReport, /Browser confirmed download completion/);
  const completedId = card.id;
  // A second task remains visible from another tab while running.
  await call({ type: "DETECTED_CANDIDATES", pageUrl: "https://page.example/A", candidates: [
    { url: "https://a.example/A1.mp4", type: "mp4", identityKey: "A1", title: "A1" }
  ] }, sender);
  const task = (await call({ type: "GET_STATE", activeTabId: 1 })).data.cards.find((item) => item.title === "A1");
  await call({ type: "DOWNLOAD_CARD", cardId: task.id, variantId: task.selectedVariantId });
  assert.equal((await call({ type: "GET_STATE", activeTabId: 2 })).data.cards.find((item) => item.id === task.id).status, "downloading");
  // Navigating A's tab to B and scanning B cannot remove either task.
  await call({ type: "DETECTED_CANDIDATES", pageUrl: "https://page.example/B", candidates: [
    { url: "https://b.example/B1.mp4", type: "mp4", identityKey: "B1" }
  ] }, sender);
  let otherTabCards = (await call({ type: "GET_STATE", activeTabId: 2 })).data.cards;
  assert.ok(otherTabCards.some((item) => item.id === completedId && item.status === "completed"));
  assert.ok(otherTabCards.some((item) => item.id === task.id && item.status === "downloading"));
  assert.ok(!otherTabCards.some((item) => item.variants.some((variant) => variant.url.includes("B1"))));
  await handlers.tabRemoved(1);
  await handlers.downloadChanged({ id: 4, state: { current: "complete" } });
  await call({ type: "UPDATE_SETTINGS", settings: { preserveOldPages: false, enabledTypes: { mp4: false } } });
  otherTabCards = (await call({ type: "GET_STATE", activeTabId: 2 })).data.cards;
  assert.ok(otherTabCards.some((item) => item.id === task.id && item.status === "completed"));
  assert.ok(otherTabCards.some((item) => item.id === completedId && item.status === "completed"));
  assert.ok(stored.vd_state_v1.cards[task.id], "Completion was not persisted after closing the original tab");
});
