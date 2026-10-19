// Real extension regression for P0; isolated profile and synthetic local media only.
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch-options.mjs";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import assert from "node:assert/strict";

const root = resolve(process.env.MGS_EXTENSION_PATH || ".");
const work = mkdtempSync(join(tmpdir(), "mygoseeker-p0-"));
const media = join(work, "media"); mkdirSync(media);
const generated = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "24", "-c:a", "aac", "-hls_time", "1", "-hls_list_size", "0", join(media, "video.m3u8")], { encoding: "utf8" });
assert.equal(generated.status, 0, generated.stderr);
const requests = new Map();
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://local");
  if (url.pathname === "/") { res.setHeader("content-type", "text/html"); res.end("<title>P0 test</title>"); return; }
  const name = url.pathname.slice(1);
  if (!/^(?:video\.m3u8|video\d+\.ts)$/.test(name)) { res.writeHead(404); res.end(); return; }
  let data = readFileSync(join(media, name));
  res.setHeader("content-type", name.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t");
  if (name.endsWith("m3u8")) data = Buffer.from(data.toString().replace(/^(video\d+\.ts)$/gm, "$1?delay=1"));
  else requests.set(name, (requests.get(name) || 0) + 1);
  if (url.searchParams.has("delay")) {
    const timer = setTimeout(() => res.end(data), 600);
    res.on("close", () => clearTimeout(timer));
  } else res.end(data);
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}`;
let context, popup, extensionId;
const errors = [];
async function launch() {
  context = await chromium.launchPersistentContext(join(work, "profile"), { ...browserLaunchOptions(), headless: true, acceptDownloads: true,
    downloadsPath: join(work, "downloads"), args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  extensionId = worker.url().split("/")[2];
  await worker.evaluate(() => { chrome.runtime.connectNative = () => { throw new Error("Native intentionally unavailable in isolated test"); }; });
  popup = await context.newPage();
  popup.on("pageerror", (error) => errors.push(error.message));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
}
const call = (message) => popup.evaluate((value) => chrome.runtime.sendMessage(value), message);
async function card(id) { return (await call({ type: "GET_STATE" })).data.cards.find((item) => item.id === id); }
async function waitFor(check, message, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((done) => setTimeout(done, 50));
  }
  throw new Error(message);
}
async function segmentKeys(id) {
  return popup.evaluate(async (cardId) => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("mygoseeker-binary-v1", 1); request.onupgradeneeded = () => request.result.createObjectStore("jobs"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const keys = await new Promise((resolve, reject) => { const request = db.transaction("jobs").objectStore("jobs").getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      return keys.filter((key) => key.startsWith(`hls:${cardId}:`) && key.includes(":segment:"));
    } finally { db.close(); }
  }, id);
}
try {
  await launch();
  await call({ type: "UPDATE_SETTINGS", settings: { preserveOldPages: true } });
  await call({ type: "DETECTED_CANDIDATES", pageUrl: base, candidates: [{ url: `${base}/video.m3u8`, type: "m3u8", title: "P0 resumable", identityKey: "p0" }] });
  const initial = (await call({ type: "GET_STATE" })).data.cards.find((item) => item.title === "P0 resumable");
  assert.ok(initial);
  const pending = call({ type: "DOWNLOAD_CARD", cardId: initial.id, variantId: initial.selectedVariantId });
  pending.catch(() => {});
  const saved = await waitFor(async () => { const keys = await segmentKeys(initial.id); return keys.length >= 4 && keys; }, "No segments were checkpointed");
  assert.ok((await call({ type: "CONTROL_DOWNLOAD", cardId: initial.id, action: "pause" })).ok);
  assert.ok((await pending).ok);
  assert.equal((await card(initial.id)).status, "paused");
  const completedKeys = await segmentKeys(initial.id);
  const completedCounts = completedKeys.map((key) => {
    const name = `video${Number(key.split(":").at(-1))}.ts`;
    return [name, requests.get(name)];
  });
  await popup.locator('[data-tab="downloading"]').click();
  const row = popup.locator(`[data-card-id="${initial.id}"]`);
  await row.locator(".resume-btn").waitFor({ state: "visible" });
  // Restart the whole browser with the same profile, proving checkpoints outlive the worker.
  await context.close();
  await launch();
  assert.equal((await card(initial.id)).status, "paused");
  assert.ok((await call({ type: "CONTROL_DOWNLOAD", cardId: initial.id, action: "resume" })).ok);
  const completed = await waitFor(async () => {
    const value = await card(initial.id);
    if (value.status === "error") throw new Error(`${value.error}\n${value.debugReport}`);
    return value.status === "completed" && value;
  }, "Resumed HLS never completed");
  assert.ok(completed.lastValidation.ok);
  for (const [name, count] of completedCounts) assert.equal(requests.get(name), count, `${name} was downloaded again`);
  await waitFor(async () => !(await segmentKeys(initial.id)).length, "Completed checkpoint was not cleared");
  // Cancel a second attempt while network requests are active. It must not auto-switch methods.
  const second = call({ type: "DOWNLOAD_CARD", cardId: initial.id, variantId: initial.selectedVariantId });
  second.catch(() => {});
  await waitFor(async () => (await card(initial.id)).stage.startsWith("Downloading HLS segments"), "Second HLS did not start");
  assert.ok((await call({ type: "CONTROL_DOWNLOAD", cardId: initial.id, action: "cancel" })).ok);
  assert.ok((await second).ok);
  assert.equal((await card(initial.id)).status, "available");
  assert.equal((await segmentKeys(initial.id)).length, 0);
  await new Promise((done) => setTimeout(done, 800));
  assert.equal((await card(initial.id)).status, "available");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, restartRecovery: true, reusedSegments: completedKeys.length, checkpointCleanup: true, pauseResumeUi: true, cancelWithoutFallback: true, initialSavedSegments: saved.length, temporaryArtifacts: work }, null, 2));
} finally {
  await context?.close();
  await new Promise((done) => server.close(done));
}
