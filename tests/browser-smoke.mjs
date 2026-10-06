// Uses a temporary Chromium profile and local synthetic media; never touches the user's browser.
import { chromium } from "@playwright/test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import assert from "node:assert/strict";

const root = resolve(process.env.MGS_EXTENSION_PATH || ".");
const work = mkdtempSync(join(tmpdir(), "mygoseeker-smoke-"));
const mediaDir = join(work, "media"); mkdirSync(mediaDir);
function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
ffmpeg(["-f", "lavfi", "-i", "testsrc=size=160x90:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "24", "-c:a", "aac", join(mediaDir, "direct.mp4")]);
ffmpeg(["-i", join(mediaDir, "direct.mp4"), "-an", "-c:v", "copy", "-hls_time", "1", "-hls_list_size", "0", "-hls_segment_type", "fmp4", "-hls_flags", "single_file", join(mediaDir, "video.m3u8")]);
ffmpeg(["-i", join(mediaDir, "direct.mp4"), "-vn", "-c:a", "copy", "-hls_time", "1", "-hls_list_size", "0", join(mediaDir, "audio.m3u8")]);
writeFileSync(join(mediaDir, "master.m3u8"), '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Test audio",DEFAULT=YES,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=200000,RESOLUTION=160x90,CODECS="avc1.64000a,mp4a.40.2",AUDIO="audio"\nvideo.m3u8\n');
let retried = false;
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://local").pathname;
  if (path === "/favicon.ico") { res.writeHead(204); res.end(); return; }
  if (path === "/") { res.setHeader("content-type", "text/html"); res.end('<title>Smoke video</title><video controls src="/direct.mp4"></video>'); return; }
  if (path === "/B") { res.setHeader("content-type", "text/html"); res.end('<title>Page B</title>Page B'); return; }
  if (path === "/slow.mp4") {
    res.setHeader("content-type", "video/mp4");
    const data = readFileSync(join(mediaDir, "direct.mp4"));
    res.setHeader("content-length", data.length);
    res.flushHeaders();
    setTimeout(() => res.end(data), 3000);
    return;
  }
  if (path === "/redirect.m3u8") { res.writeHead(302, { location: "/nested/master.m3u8" }); res.end(); return; }
  const fileName = path.split('/').at(-1);
  if (fileName !== "direct.mp4" && !path.startsWith("/nested/")) { res.writeHead(404); res.end(); return; }
  if (fileName === "audio0.ts" && !retried) { retried = true; res.writeHead(503); res.end("retry"); return; }
  try {
    const data = readFileSync(join(mediaDir, fileName));
    res.setHeader("content-type", fileName.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : fileName.endsWith("ts") ? "video/mp2t" : "video/mp4");
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]), end = Number(range[2]);
      res.writeHead(206, { "content-range": `bytes ${start}-${end}/${data.length}` }); res.end(data.subarray(start, end + 1));
    } else res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const errors = [];
let context;
try {
  context = await chromium.launchPersistentContext(join(work, "profile"), {
    channel: "chromium", headless: true, acceptDownloads: true, downloadsPath: join(work, "downloads"),
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  context.on("page", (page) => {
    page.on("console", (message) => { if (message.type() === "error") console.error("Browser:", message.text()); });
    page.on("requestfailed", (request) => console.error("Request failed:", request.url(), request.failure()));
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = worker.url().split('/')[2];
  // Native registration belongs to the OS, so simulate absence to test the extension fallback in isolation.
  await worker.evaluate(() => {
    chrome.runtime.connectNative = () => { throw new Error("Native disabled for isolated smoke test"); };
  });
  const videoPage = await context.newPage(); await videoPage.goto(base);
  const popup = await context.newPage();
  popup.on("pageerror", (error) => errors.push(error.message));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const call = (message) => popup.evaluate((message) => chrome.runtime.sendMessage(message), message);
  const tabs = await popup.evaluate(() => chrome.tabs.query({}));
  const tabId = tabs.find((tab) => tab.url.startsWith(base)).id;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  let cards = (await call({ type: "GET_STATE", activeTabId: tabId })).data.cards;
  assert.ok(cards.some((card) => card.variants.some((v) => v.url.endsWith("direct.mp4"))), "DOM/network detection failed");
  const direct = cards.find((card) => card.variants.some((v) => v.url.endsWith("direct.mp4")));
  assert.ok((await call({ type: "DOWNLOAD_CARD", cardId: direct.id, variantId: direct.selectedVariantId })).ok);
  async function waitCompleted(cardId, activeTabId) {
    for (let i = 0; i < 120; i++) {
      const card = (await call({ type: "GET_STATE", activeTabId })).data.cards.find((c) => c.id === cardId);
      if (card?.status === "completed") return card;
      if (card?.status === "error") throw new Error(`${card.error}\n${card.debugReport}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Download did not reach completed state");
  }
  await waitCompleted(direct.id, tabId);
  assert.equal((await call({ type: "GET_STATE", activeTabId: tabId })).data.settings.preserveOldPages, false);
  const bPage = await context.newPage(); await bPage.goto(`${base}/B`);
  const bTabId = (await popup.evaluate(() => chrome.tabs.query({}))).find((tab) => tab.url === `${base}/B`).id;
  assert.ok((await call({ type: "GET_STATE", activeTabId: bTabId })).data.cards.some((card) => card.id === direct.id && card.status === "completed"));
  await call({ type: "DETECTED_CANDIDATES", pageUrl: `${base}/A`, candidates: [
    { url: `${base}/slow.mp4`, type: "mp4", title: "A1 across pages", identityKey: "slow-A1" }
  ] });
  const popupTabId = (await popup.evaluate(() => chrome.tabs.getCurrent())).id;
  const slow = (await call({ type: "GET_STATE", activeTabId: popupTabId })).data.cards.find((card) => card.title === "A1 across pages");
  assert.ok((await call({ type: "DOWNLOAD_CARD", cardId: slow.id, variantId: slow.selectedVariantId })).ok);
  let bCards = (await call({ type: "GET_STATE", activeTabId: bTabId })).data.cards;
  assert.ok(bCards.some((card) => card.id === slow.id && card.status === "downloading"));
  await videoPage.goto(`${base}/B`);
  await call({ type: "DETECTED_CANDIDATES", pageUrl: `${base}/B`, candidates: [
    { url: `${base}/direct.mp4`, type: "mp4", title: "B1 scan", identityKey: "B1-scan" }
  ] });
  await waitCompleted(slow.id, bTabId);
  await videoPage.close();
  bCards = (await call({ type: "GET_STATE", activeTabId: bTabId })).data.cards;
  assert.ok(bCards.some((card) => card.id === direct.id && card.status === "completed"));
  assert.ok(bCards.some((card) => card.id === slow.id && card.status === "completed"));
  await call({ type: "UPDATE_SETTINGS", settings: { preserveOldPages: true } });
  // Candidate submitted from the extension tab to exercise master expansion and persisted audio metadata.
  assert.ok((await call({ type: "DETECTED_CANDIDATES", pageUrl: `${base}/hls`, pageTitle: "HLS smoke", candidates: [{ url: `${base}/redirect.m3u8`, type: "m3u8", source: "smoke", title: "HLS smoke" }] })).ok);
  cards = (await call({ type: "GET_STATE", activeTabId: tabId })).data.cards;
  const hls = cards.find((card) => card.title === "HLS smoke");
  assert.ok(hls?.variants[0]?.audioUrl?.endsWith("audio.m3u8"), "Audio metadata was lost during expansion");
  const response = await call({ type: "DOWNLOAD_CARD", cardId: hls.id, variantId: hls.selectedVariantId });
  if (!response.ok) console.error(JSON.stringify((await call({ type: "GET_STATE", activeTabId: tabId })).data.cards.find((c) => c.id === hls.id), null, 2));
  assert.ok(response.ok, response.error);
  const completed = await waitCompleted(hls.id, tabId);
  assert.equal(completed.downloadMode, "remuxed-source-av");
  assert.ok(completed.lastValidation.ok);
  const downloads = await popup.evaluate(() => chrome.downloads.search({}));
  const downloaded = downloads.find((item) => item.url.startsWith("blob:"));
  assert.ok(downloaded, JSON.stringify(downloads));
  assert.equal(downloaded.state, "complete");
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", downloaded.filename], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
  const info = JSON.parse(probe.stdout);
  assert.ok(info.streams.some((s) => s.codec_type === "video"));
  assert.ok(info.streams.some((s) => s.codec_type === "audio"));
  assert.ok(Math.abs(Number(info.format.duration) - 4) < 1);
  assert.ok(retried, "Transient segment failure was not exercised");
  await call({ type: "DETECTED_CANDIDATES", pageUrl: `${base}/hls`, pageTitle: "HLS smoke", candidates: [
    { url: `${base}/redirect.m3u8`, type: "m3u8", source: "smoke", title: "HLS parallel", identityKey: "second-video" }
  ] });
  const second = (await call({ type: "GET_STATE", activeTabId: tabId })).data.cards.find((card) => card.title === "HLS parallel");
  assert.ok(second, "Cached playlist options overwrote the second video's title/identity");
  const parallelResults = await Promise.all([hls, second].map((card) => call({ type: "DOWNLOAD_CARD", cardId: card.id, variantId: card.selectedVariantId })));
  assert.ok(parallelResults.every((result) => result.ok), JSON.stringify(parallelResults));
  await Promise.all([hls, second].map((card) => waitCompleted(card.id, tabId)));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, direct: "completed", hls: completed.downloadMode, duration: info.format.duration,
    streams: info.streams.map((s) => s.codec_type), rangeAndRetry: true, concurrentHlsJobs: 2,
    downloadingAndCompletedVisibleFromB: true, temporaryArtifacts: work }, null, 2));
} finally { await context?.close(); await new Promise((resolve) => server.close(resolve)); }
