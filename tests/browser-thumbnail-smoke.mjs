import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch-options.mjs";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import assert from "node:assert/strict";

const work = mkdtempSync(join(tmpdir(), "mgs-thumbnails-"));
const file = join(work, "video.mp4");
const generated = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=10", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", file], { encoding: "utf8" });
assert.equal(generated.status, 0, generated.stderr);
const bytes = readFileSync(file);
const remote = createServer((_req, res) => { res.setHeader("Content-Type", "video/mp4"); res.end(bytes); });
await new Promise((r) => remote.listen(0, "127.0.0.1", r));
const remoteUrl = `http://127.0.0.1:${remote.address().port}/video.mp4`;
const server = createServer((req, res) => {
  if (req.url.startsWith("/video.mp4")) { res.setHeader("Content-Type", "video/mp4"); res.end(bytes); return; }
  if (req.url === "/bad.jpg" || req.url === "/favicon.ico") { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", "text/html");
  res.end('<title>Thumbnail tests</title><video title="Delayed player" preload="none" poster="/bad.jpg" src="/video.mp4" width="320" height="180" controls></video>');
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let context;
try {
  const root = resolve(process.env.MGS_EXTENSION_PATH || ".");
  context = await chromium.launchPersistentContext(join(work, "profile"), { ...browserLaunchOptions(), headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const id = worker.url().split("/")[2];
  const page = await context.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const ui = await context.newPage(); await ui.goto(`chrome-extension://${id}/popup.html`);
  const tabId = (await ui.evaluate(() => chrome.tabs.query({}))).find((t) => t.url.startsWith(`http://127.0.0.1:${server.address().port}/`)).id;
  const call = (m) => ui.evaluate((m) => chrome.runtime.sendMessage(m), m);
  async function waitCard(predicate) {
    for (let i = 0; i < 60; i++) {
      const cards = (await call({ type: "GET_STATE", activeTabId: tabId })).data.cards;
      const card = cards.find(predicate); if (card) return card;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("Thumbnail condition timed out");
  }
  await waitCard((c) => c.title === "Delayed player" && c.thumbnailDebug?.entries.some((e) => e.stage === "poster-failed"));
  await page.evaluate(() => document.querySelector("video").load());
  const decoded = await waitCard((c) => c.title === "Delayed player" && c.thumbnail.startsWith("data:image/jpeg;base64,"));
  assert.ok(decoded.thumbnailDebug.entries.some((e) => e.stage === "frame-captured"));
  await page.bringToFront();
  await page.evaluate((url) => { const video = document.querySelector("video"); video.title = "Cross origin player"; video.poster = ""; video.src = url; video.load(); }, remoteUrl);
  const visible = await waitCard((c) => c.thumbnailDebug?.entries.some((e) => e.stage === "visible-frame-captured"));
  assert.match(visible.thumbnail, /^data:image\/jpeg;base64,/);
  assert.notEqual(visible.thumbnail, decoded.thumbnail);
  // Ensure the visible capture contains video pixels, not a blank image.
  const colors = await page.evaluate(async (src) => {
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 64) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size;
  }, visible.thumbnail);
  assert.ok(colors > 20);
  console.log(JSON.stringify({ ok: true, delayedDecode: true, brokenPosterRecovery: true, sourceChange: true, crossOriginVisibleFrame: true, pixelColors: colors }));
} finally {
  await context?.close();
  await Promise.all([new Promise((r) => server.close(r)), new Promise((r) => remote.close(r))]);
}
