import test from "node:test";
import assert from "node:assert/strict";

test("enabled native jobs dispatch filename/context and complete with report; failures fall back", async () => {
  const handlers = {}, sent = [], values = {};
  let nativeConnections = 0, browserDownloads = 0;
  const event = (name) => ({ addListener: (fn) => { handlers[name] = fn; } });
  const portEvent = () => {
    const listeners = new Set();
    return { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn),
      emit: (message) => [...listeners].forEach((fn) => fn(message)) };
  };
  const port = { onMessage: portEvent(), onDisconnect: portEvent(), disconnect() {},
    postMessage(message) {
      sent.push(message);
      if (message.type === "HELLO") queueMicrotask(() => port.onMessage.emit({ type: "READY" }));
      if (message.type === "EXPORT_REPORT") queueMicrotask(() => port.onMessage.emit({
        type: "JOB_REPORT_READY", jobId: message.jobId, reportBody: "Native test report" }));
    }
  };
  globalThis.chrome = {
    runtime: { onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message"),
      sendMessage: async () => {}, connectNative: () => { nativeConnections++; return port; } },
    storage: { local: { get: async () => values, set: async (patch) => Object.assign(values, structuredClone(patch)) } },
    tabs: { onUpdated: event("updated"), onRemoved: event("removed"), get: async () => ({ url: "https://page.example/" }) },
    cookies: { getAll: async () => [] },
    webRequest: { onCompleted: event("network"), onHeadersReceived: event("headers") },
    downloads: { onChanged: event("download"), download: async () => ++browserDownloads }
  };
  await import("../background.js");
  const call = (message, sender = {}) => new Promise((resolve) => handlers.message(message, sender, resolve));
  assert.equal((await call({ type: "GET_SETTINGS" })).data.nativeHelperEnabled, false);
  await call({ type: "GET_SETUP_STATE" });
  assert.equal(nativeConnections, 0);
  await call({ type: "UPDATE_SETTINGS", settings: { nativeHelperEnabled: true, fileNameRule: "native_{title}" } });
  const add = async (title) => {
    await call({ type: "DETECTED_CANDIDATES", pageUrl: "https://page.example/", candidates: [
      { url: `https://media.example/${title}.mp4`, type: "mp4", title, identityKey: title }
    ] }, { tab: { id: 1 } });
    return (await call({ type: "GET_STATE", activeTabId: 1 })).data.cards.find((card) => card.title === title);
  };
  const first = await add("one");
  assert.ok((await call({ type: "DOWNLOAD_CARD", cardId: first.id, variantId: first.selectedVariantId })).ok);
  const job = sent.find((message) => message.type === "START_JOB").job;
  assert.match(job.outputName, /^native_one\.mp4$/);
  assert.equal(job.requestContext.pageUrl, "https://page.example/");
  assert.equal(browserDownloads, 0);
  port.onMessage.emit({ type: "JOB_COMPLETED", jobId: job.jobId, validation: { ok: true } });
  for (let attempt = 0; attempt < 50; attempt++) {
    const card = (await call({ type: "GET_STATE", activeTabId: 1 })).data.cards.find((card) => card.id === first.id);
    if (card.debugReport === "Native test report") { assert.equal(card.status, "completed"); break; }
    if (attempt === 49) assert.fail("Native completion/report did not reach extension state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const second = await add("two");
  assert.ok((await call({ type: "DOWNLOAD_CARD", cardId: second.id, variantId: second.selectedVariantId })).ok);
  const failed = sent.filter((message) => message.type === "START_JOB").at(-1).job;
  port.onMessage.emit({ type: "JOB_FAILED", jobId: failed.jobId, message: "HTTP 403" });
  for (let attempt = 0; attempt < 50 && !browserDownloads; attempt++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(browserDownloads, 1);
  const fallback = (await call({ type: "GET_STATE", activeTabId: 1 })).data.cards.find((card) => card.id === second.id);
  assert.equal(fallback.nativeJobId, "");
});
