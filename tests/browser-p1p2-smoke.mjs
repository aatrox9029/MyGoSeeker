import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch-options.mjs";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createCipheriv, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve(process.env.MGS_EXTENSION_PATH || "."), work = mkdtempSync(join(tmpdir(), "mygoseeker-p1p2-")), media = join(work, "media");
mkdirSync(media);
function ffmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8", cwd: media });
  assert.equal(result.status, 0, result.stderr);
}
ffmpeg(["-f", "lavfi", "-i", "testsrc=size=160x90:rate=24", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "24", "-c:a", "aac", join(media, "direct.mp4")]);
ffmpeg(["-i", join(media, "direct.mp4"), "-c", "copy", "-hls_time", "1", "-hls_list_size", "0", join(media, "video.m3u8")]);
writeFileSync(join(media, "disguised.m3u8"), readFileSync(join(media, "video.m3u8"), "utf8").replace(/video(\d+)\.ts/g, "video$1.jpg"));
// Real media with rotating keys, sequence IV, explicit IV and a clear segment.
const aesKeys = [randomBytes(16), randomBytes(16)];
aesKeys.forEach((key, index) => writeFileSync(join(media, `aes${index}.key`), key));
let aesIndex = 0;
const aesText = readFileSync(join(media, "video.m3u8"), "utf8").replace("#EXT-X-MEDIA-SEQUENCE:0", "#EXT-X-MEDIA-SEQUENCE:73").replace(/^video\d+\.ts$/gm, (name) => {
  const index = aesIndex++, encryptedName = `aes${index}.jpg`;
  if (index === 2) { writeFileSync(join(media, encryptedName), readFileSync(join(media, name))); return `#EXT-X-KEY:METHOD=NONE\n${encryptedName}`; }
  const iv = Buffer.alloc(16); iv.writeUInt32BE(index === 0 ? 73 : 100 + index, 12);
  const cipher = createCipheriv("aes-128-cbc", aesKeys[index % 2], iv);
  writeFileSync(join(media, encryptedName), Buffer.concat([cipher.update(readFileSync(join(media, name))), cipher.final()]));
  return `#EXT-X-KEY:METHOD=AES-128,URI="aes${index % 2}.key"${index ? `,IV=0x${iv.toString("hex")}` : ""}\n${encryptedName}`;
});
writeFileSync(join(media, "aes.m3u8"), aesText);
writeFileSync(join(media, "aes-denied.m3u8"), aesText.replace(/aes\d\.key/g, "denied.key"));
writeFileSync(join(media, "drm.m3u8"), aesText.replace(/METHOD=AES-128/g, "METHOD=SAMPLE-AES"));
ffmpeg(["-i", join(media, "direct.mp4"), "-map", "0:v", "-map", "0:a", "-c", "copy", "-seg_duration", "1", "-f", "dash", join(media, "stream.mpd")]);
const originalMpd = readFileSync(join(media, "stream.mpd"), "utf8");
const periodBody = originalMpd.match(/<Period[^>]*>([\s\S]*?)<\/Period>/)[1];
writeFileSync(join(media, "multi.mpd"), `<MPD mediaPresentationDuration="PT8S"><Period id="a" duration="PT4S">${periodBody}</Period><Period id="b" duration="PT4S">${periodBody}</Period></MPD>`);
for (const [kind, map] of [["video", "0:v"], ["audio", "0:a"]]) ffmpeg(["-i", join(media, "direct.mp4"), "-map", map, "-c", "copy", "-movflags", "+frag_keyframe+empty_moov+default_base_moof+global_sidx", join(media, `indexed-${kind}.mp4`)]);
function indexedRepresentation(kind, codecs) {
  const data = readFileSync(join(media, `indexed-${kind}.mp4`)); let offset = 0;
  while (offset + 8 <= data.length) { const size = data.readUInt32BE(offset), type = data.toString("ascii", offset + 4, offset + 8); if (type === "sidx") return `<AdaptationSet mimeType="${kind}/mp4" codecs="${codecs}"><Representation id="${kind}"><BaseURL>indexed-${kind}.mp4</BaseURL><SegmentBase indexRange="${offset}-${offset + size - 1}"><Initialization range="0-${offset - 1}"/></SegmentBase></Representation></AdaptationSet>`; assert.ok(size >= 8); offset += size; }
  throw new Error("Fixture has no global sidx");
}
writeFileSync(join(media, "indexed.mpd"), `<MPD mediaPresentationDuration="PT4S"><Period>${indexedRepresentation("video", "avc1")}${indexedRepresentation("audio", "mp4a")}</Period></MPD>`);
const dynamicEpoch = Date.now() - 10000;
function dynamicMpd() {
  const end = Math.floor((Date.now() - dynamicEpoch) / 1000), start = end - 3;
  return `<MPD type="dynamic" availabilityStartTime="${new Date(dynamicEpoch).toISOString()}" minimumUpdatePeriod="PT0.5S" timeShiftBufferDepth="PT3S"><Period><AdaptationSet mimeType="video/mp4" codecs="avc1"><Representation id="v"><SegmentTemplate timescale="12288" startNumber="${start + 1}" media="live-$Number$.m4s" initialization="init-stream0.m4s"><SegmentTimeline><S t="${start * 12288}" d="12288" r="2"/></SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>`;
}
// Use distinct prefixes so the second DASH fixture cannot overwrite the first.
ffmpeg(["-i", join(media, "direct.mp4"), "-map", "0:v", "-map", "0:a", "-c:v", "libvpx-vp9", "-c:a", "libopus", "-seg_duration", "1", "-init_seg_name", "webm-init-$RepresentationID$.webm", "-media_seg_name", "webm-$RepresentationID$-$Number%05d$.webm", "-f", "dash", join(media, "webm.mpd")]);
writeFileSync(join(media, "master.m3u8"), '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",LANGUAGE="en",NAME="English",URI="audio.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",LANGUAGE="ja",NAME="Japanese",URI="audio.m3u8?ja=1"\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",LANGUAGE="en",NAME="English",URI="sub.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=200000,RESOLUTION=160x90,CODECS="avc1.64000a,mp4a.40.2",AUDIO="a",SUBTITLES="s"\nvideo.m3u8\n');
ffmpeg(["-i", join(media, "direct.mp4"), "-vn", "-c:a", "copy", "-hls_time", "1", "-hls_list_size", "0", join(media, "audio.m3u8")]);
writeFileSync(join(media, "sub.m3u8"), "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nsub0.vtt\n#EXTINF:2,\nsub1.vtt\n#EXT-X-ENDLIST\n");
for (const i of [0, 1]) writeFileSync(join(media, `sub${i}.vtt`), `WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${90000 + i * 180000}\n\n00:00:00.000 --> 00:00:01.000\nSubtitle ${i}\n`);
const errors = [], requests = new Map(), suggestedNames = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://local"), name = url.pathname.slice(1);
  requests.set(req.url, (requests.get(req.url) || 0) + 1);
  if (name === "dynamic.mpd") { res.setHeader("content-type", "application/dash+xml"); res.end(dynamicMpd()); return; }
  if (/^live-\d+\.m4s$/.test(name)) { res.setHeader("content-type", "video/mp4"); res.end(readFileSync(join(media, `chunk-stream0-${String((Number(name.match(/\d+/)[0]) - 1) % 4 + 1).padStart(5, "0")}.m4s`))); return; }
  if (name.startsWith("indexed-") && req.headers.range) {
    const data = readFileSync(join(media, name)), range = req.headers.range.match(/bytes=(\d+)-(\d+)/), start = Number(range[1]), end = Number(range[2]);
    res.writeHead(206, { "content-type": "video/mp4", "content-range": `bytes ${start}-${end}/${data.length}`, "content-length": end - start + 1 }); res.end(data.subarray(start, end + 1)); return;
  }
  if (name === "denied.key") { res.writeHead(403); res.end("denied"); return; }
  if (!name) { res.setHeader("content-type", "text/html"); res.end('<title>Players</title><iframe src="/frame"></iframe><div id="host"></div><script>setTimeout(()=>{const r=document.querySelector("#host").attachShadow({mode:"open"});r.innerHTML=`<video src="/direct.mp4?shadow=1" controls></video>`;},300);</script>'); return; }
  if (name === "frame") { res.setHeader("content-type", "text/html"); res.end('<title>Frame player</title><video controls></video><script>fetch("/direct.mp4").then(r=>r.blob()).then(b=>document.querySelector("video").src=URL.createObjectURL(b));</script>'); return; }
  if (name === "large.m3u8") { res.setHeader("content-type", "application/vnd.apple.mpegurl"); res.end("#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nlarge.ts\n#EXT-X-ENDLIST\n"); return; }
  if (name === "large.ts") { res.setHeader("content-type", "video/mp2t"); res.setHeader("content-length", 17 * 1024 * 1024); res.flushHeaders(); res.end(); return; }
  let filename = name;
  if (/^video\d+\.jpg$/.test(name)) filename = name.replace(/\.jpg$/, ".ts");
  if (["live.m3u8", "slow.m3u8"].includes(name)) filename = "video.m3u8";
  if (!/^[\w.-]+$/.test(filename)) { res.writeHead(404); res.end(); return; }
  try {
    let data = readFileSync(join(media, filename));
    res.setHeader("content-type", name.endsWith("jpg") ? "image/jpeg" : filename.endsWith("mpd") ? "application/dash+xml" : filename.endsWith("m3u8") ? "application/vnd.apple.mpegurl" : filename.endsWith("vtt") ? "text/vtt" : filename.endsWith("ts") ? "video/mp2t" : "video/mp4");
    if (name === "live.m3u8") data = Buffer.from(data.toString().replace("#EXT-X-ENDLIST", ""));
    if (name === "slow.m3u8") data = Buffer.from(data.toString().replace(/^(video\d+\.ts)$/gm, `$1?slow=1${url.searchParams.has("manager") ? "&manager=1" : ""}`));
    if (url.searchParams.has("slow")) { const timer = setTimeout(() => res.end(data), url.searchParams.has("manager") ? 15000 : 2500); res.on("close", () => clearTimeout(timer)); }
    else res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let context, popup, worker, extensionId;
async function connectWorker() {
  extensionId = worker.url().split("/")[2];
  await worker.evaluate(() => {
    chrome.runtime.connectNative = () => { throw new Error("Native disabled in isolated test"); };
    globalThis.testRequestedFilenames = [];
    const download = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = async (options) => { globalThis.testRequestedFilenames.push(options.filename); return download(options); };
  });
  popup = await context.newPage(); popup.on("pageerror", (error) => errors.push(error.message));
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
}
async function launch() {
  context = await chromium.launchPersistentContext(join(work, "profile"), { ...browserLaunchOptions(), headless: true, acceptDownloads: true, downloadsPath: join(work, "downloads"), args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`] });
  context.on("page", (page) => page.on("download", (download) => suggestedNames.push(download.suggestedFilename())));
  [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent("serviceworker");
  await connectWorker();
}
const call = (message) => popup.evaluate((value) => chrome.runtime.sendMessage(value), message);
async function waitFor(fn, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 75)); }
  throw new Error(label);
}
async function getCard(id) { return (await call({ type: "GET_STATE" })).data.cards.find((card) => card.id === id); }
async function ingest(name, file, type = "m3u8") {
  const response = await call({ type: "DETECTED_CANDIDATES", pageUrl: `${base}/${name}`, candidates: [{ url: `${base}/${file}`, type, title: name, identityKey: name }] });
  assert.ok(response.ok, response.error);
  return (await call({ type: "GET_STATE" })).data.cards.find((card) => card.title === name);
}
async function complete(card, options) {
  const response = await call({ type: "DOWNLOAD_CARD", cardId: card.id, variantId: card.selectedVariantId, options }); assert.ok(response.ok, response.error);
  return waitFor(async () => { const value = await getCard(card.id); if (value.status === "error") throw new Error(`${value.error}\n${value.debugReport}`); return value.status === "completed" && value; }, `${card.title} never completed`);
}
async function probeLast() {
  const downloads = await popup.evaluate(() => chrome.downloads.search({ orderBy: ["-startTime"] }));
  const item = downloads.find((item) => item.url.startsWith("blob:")); assert.equal(item.state, "complete");
  const result = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", item.filename], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
}
try {
  await launch(); await call({ type: "UPDATE_SETTINGS", settings: { preserveOldPages: true, fileNameRule: "{title}-{quality}" } });
  const players = await context.newPage(); await players.goto(base);
  await waitFor(async () => { const cards = (await call({ type: "GET_STATE" })).data.cards; return cards.some((card) => card.frameId > 0 && card.variants.some((variant) => variant.isBlob)) && cards.some((card) => card.variants.some((variant) => variant.url.includes("shadow=1") && variant.source === "dom")); }, "iframe or dynamic Shadow DOM player was not detected");
  const frameCard = (await call({ type: "GET_STATE" })).data.cards.find((card) => card.frameId > 0 && card.variants.some((variant) => variant.isBlob));
  await complete(frameCard); // Targeted iframe content fetch, not the top-level page.
  console.log("P2 player detection and iframe download passed");
  const disguised = await ingest("Image-suffixed HLS", "disguised.m3u8");
  await complete(disguised);
  const disguisedInfo = await probeLast();
  assert.ok(disguisedInfo.streams.some((stream) => stream.codec_type === "video"));
  assert.ok(disguisedInfo.streams.some((stream) => stream.codec_type === "audio"));
  assert.ok(Math.abs(Number(disguisedInfo.format.duration) - 4) < 1);
  assert.ok([...requests.keys()].some((url) => /^\/video\d+\.jpg$/.test(url)));
  console.log("Image-suffixed MPEG-TS HLS passed WASM remux and ffprobe");
  assert.equal(await popup.locator(".stream-options, .audio-select, .audio-only, .live-seconds, .subtitle-select, .subtitle-btn").count(), 0);
  const aes = await ingest("AES-128 HLS", "aes.m3u8");
  await complete(aes);
  const aesInfo = await probeLast();
  assert.ok(aesInfo.streams.some((stream) => stream.codec_type === "video"));
  assert.ok(aesInfo.streams.some((stream) => stream.codec_type === "audio"));
  assert.ok(Math.abs(Number(aesInfo.format.duration) - 4) < 1);
  assert.ok((await getCard(aes.id)).debugReport.includes("Decrypted AES-128 segment"));
  for (const [title, file, error] of [["AES key denied", "aes-denied.m3u8", /HLS key request failed: HTTP 403/], ["DRM source", "drm.m3u8", /Unsupported HLS encryption \/ DRM/]]) {
    const card = await ingest(title, file);
    await call({ type: "DOWNLOAD_CARD", cardId: card.id });
    assert.match((await getCard(card.id)).error, error);
  }
  console.log("AES-128 rotating keys and clear transition passed WASM/ffprobe; key denial and DRM errors passed");
  const dash = await ingest("DASH test", "stream.mpd", "mpd");
  await complete(dash); const dashInfo = await probeLast();
  assert.ok(dashInfo.streams.some((stream) => stream.codec_type === "video")); assert.ok(dashInfo.streams.some((stream) => stream.codec_type === "audio"));
  console.log("P2 DASH output passed ffprobe");
  const multi = await ingest("Multi Period DASH", "multi.mpd", "mpd"); await complete(multi);
  const multiInfo = await probeLast(); assert.ok(Math.abs(Number(multiInfo.format.duration) - 8) < 1, JSON.stringify(multiInfo.format));
  assert.ok(multiInfo.streams.some((s) => s.codec_type === "audio")); assert.ok(multiInfo.streams.some((s) => s.codec_type === "video"));
  const indexed = await ingest("sidx DASH", "indexed.mpd", "mpd"); await complete(indexed);
  const indexedInfo = await probeLast(); assert.ok(Math.abs(Number(indexedInfo.format.duration) - 4) < 1); assert.ok(indexedInfo.streams.some((s) => s.codec_type === "audio"));
  const dynamic = await ingest("Dynamic DASH", "dynamic.mpd", "mpd"); await complete(dynamic, { liveSeconds: 2 });
  const dynamicInfo = await probeLast(); assert.ok(Math.abs(Number(dynamicInfo.format.duration) - 2) < 0.5, JSON.stringify(dynamicInfo.format));
  assert.ok((await getCard(dynamic.id)).debugReport.includes("Updated dynamic MPD"));
  console.log("Expanded DASH multi-Period, sidx ranges and dynamic capture passed WASM/ffprobe");
  const webm = await ingest("WebM compatibility", "webm.mpd", "mpd"); await complete(webm);
  const webmInfo = await probeLast(); assert.match(webmInfo.format.format_name, /webm/); assert.ok(webmInfo.streams.some((stream) => stream.codec_name === "vp9"));
  const tracks = await ingest("Track selection", "master.m3u8");
  assert.equal(tracks.variants[0].audioTracks.length, 2); assert.equal(tracks.variants[0].subtitleTracks.length, 1);
  await complete(tracks, { audioOnly: true, audioLanguage: `${base}/audio.m3u8?ja=1` });
  const audioInfo = await probeLast(); assert.ok(audioInfo.streams.every((stream) => stream.codec_type === "audio"));
  assert.ok([...requests.keys()].some((url) => url === "/audio.m3u8?ja=1"), "Selected Japanese track was not fetched");
  // The legacy card always starts a normal video, even after old saved audio-only options.
  await popup.locator('[data-tab="completed"]').click();
  const legacyCard = popup.locator(`#completed .card[data-card-id="${tracks.id}"]`);
  await legacyCard.locator(".download-btn").click();
  await waitFor(async () => {
    const card = await getCard(tracks.id);
    if (card.status === "error") throw new Error(card.error);
    return card.status === "completed" && !card.streamOptions.audioOnly;
  }, "Legacy card did not reset old audio-only settings");
  const normalInfo = await probeLast();
  assert.ok(normalInfo.streams.some((stream) => stream.codec_type === "video"));
  assert.ok(normalInfo.streams.some((stream) => stream.codec_type === "audio"));
  await popup.setViewportSize({ width: 420, height: 850 });
  await popup.screenshot({ path: join(work, "legacy-cards.png"), fullPage: true });
  await popup.locator('[data-tab="available"]').click();
  const subtitleResponse = await call({ type: "DOWNLOAD_SUBTITLE", cardId: tracks.id, uri: `${base}/sub.m3u8` }); assert.ok(subtitleResponse.ok, subtitleResponse.error);
  const subtitle = await waitFor(async () => {
    const items = await popup.evaluate(() => chrome.downloads.search({}));
    const item = items.find((item) => item.url.startsWith("data:text/vtt"));
    if (item?.state === "interrupted") throw new Error(`Subtitle download interrupted: ${JSON.stringify(item)}`);
    return item?.state === "complete" && item;
  }, "Subtitles not saved");
  const vtt = readFileSync(subtitle.filename, "utf8"); assert.match(vtt, /Subtitle 0/); assert.match(vtt, /00:00:02.000/);
  console.log("P2 audio selection and subtitles passed");
  const live = await ingest("Live clip", "live.m3u8");
  await call({ type: "DOWNLOAD_CARD", cardId: live.id });
  assert.match((await getCard(live.id)).error, /use Record or select a completed video/);
  await complete(live, { liveSeconds: 2 });
  const liveInfo = await probeLast(); assert.ok(Number(liveInfo.format.duration) >= 1.9 && Number(liveInfo.format.duration) < 3.5, JSON.stringify(liveInfo.format));
  console.log("P2 timed live output passed ffprobe");
  const large = await ingest("Large resource", "large.m3u8"); await call({ type: "DOWNLOAD_CARD", cardId: large.id });
  assert.match((await getCard(large.id)).error, /buffer limit/);
  const space = await ingest("Low disk space", "video.m3u8");
  await worker.evaluate(() => { globalThis.originalEstimate = navigator.storage.estimate.bind(navigator.storage); navigator.storage.estimate = async () => ({ usage: 100, quota: 101 }); });
  await call({ type: "DOWNLOAD_CARD", cardId: space.id }); assert.match((await getCard(space.id)).error, /Insufficient storage/);
  await worker.evaluate(() => { navigator.storage.estimate = globalThis.originalEstimate; });
  console.log("P1 oversized resource and low storage failures passed");
  const slow = await ingest("Queue active", "slow.m3u8"), queued = await ingest("Queue pending", "slow.m3u8");
  console.log("Queue test initial state", (await call({ type: "GET_QUEUE_STATE" })).data);
  await popup.evaluate((message) => { chrome.runtime.sendMessage(message).catch(() => {}); }, { type: "DOWNLOAD_CARD", cardId: slow.id });
  await waitFor(async () => (await getCard(slow.id)).stage.startsWith("Downloading HLS segments"), "Slow task never started");
  console.log("Queue test active task started");
  assert.ok((await call({ type: "DOWNLOAD_CARD", cardId: queued.id })).ok);
  assert.equal((await getCard(queued.id)).status, "queued");
  const stats = (await call({ type: "GET_QUEUE_STATE" })).data; assert.equal(stats.active.length, 1); assert.ok(stats.reservedBytes <= stats.maxBytes);
  assert.ok((await call({ type: "CONTROL_DOWNLOAD", cardId: queued.id, action: "cancel" })).ok); assert.equal((await getCard(queued.id)).status, "available");
  await call({ type: "DOWNLOAD_CARD", cardId: queued.id });
  await call({ type: "CONTROL_DOWNLOAD", cardId: queued.id, action: "cancel" });
  await call({ type: "CONTROL_DOWNLOAD", cardId: slow.id, action: "cancel" });
  assert.deepEqual((await call({ type: "GET_QUEUE_STATE" })).data.active, []);
  assert.deepEqual((await call({ type: "GET_QUEUE_STATE" })).data.pending, []);
  console.log("P1 queue cancellation released all reservations");
  // Exercise actual popup search/sort/batch controls with two small direct downloads.
  await ingest("Batch Alpha", "direct.mp4?batch=a", "mp4"); await ingest("Batch Beta", "direct.mp4?batch=b", "mp4");
  await popup.locator("#searchCards").fill("Batch"); await popup.locator("#sortCards").selectOption("title");
  await waitFor(async () => await popup.locator("#available .card").count() === 2, "Search did not filter cards");
  for (const checkbox of await popup.locator("#available .batch-select").all()) await checkbox.check();
  await popup.locator("#batchDownload").click();
  await waitFor(async () => (await call({ type: "GET_STATE" })).data.cards.filter((card) => card.title.startsWith("Batch") && card.status === "completed").length === 2, "Batch did not complete");
  assert.deepEqual(errors, []);
  suggestedNames.push(...await worker.evaluate(() => globalThis.testRequestedFilenames));
  assert.ok(suggestedNames.some((name) => name.endsWith(".m4a")), JSON.stringify(suggestedNames));
  assert.ok(suggestedNames.some((name) => name.endsWith(".vtt")), JSON.stringify(suggestedNames));
  assert.ok(suggestedNames.some((name) => name.startsWith("Batch Alpha-")), JSON.stringify(suggestedNames));
  await popup.locator('[data-tab="completed"]').click();
  await waitFor(async () => await popup.locator("#completed .card").count() === 2, "Popup did not refresh completed batch cards");
  await popup.setViewportSize({ width: 420, height: 850 });
  await popup.screenshot({ path: join(work, "popup.png"), fullPage: true });
  const manager = await context.newPage(); manager.on("pageerror", (error) => errors.push(error.message));
  manager.on("console", (message) => { if (message.text().includes("Batch download control")) console.log(message.text()); });
  await manager.goto(`chrome-extension://${extensionId}/manager.html`);
  await manager.locator("#searchCards").fill("Multi Period DASH");
  await manager.locator('[data-tab="completed"]').click();
  await waitFor(async () => await manager.locator("#completed .card").count() === 1, "Manager did not show global tasks");
  await manager.locator("#completed .preview-btn").click();
  await waitFor(async () => /(?:Periods|區段數): 2/.test(await manager.locator("#completed .preview-text").textContent()), "DASH preview did not show Periods");
  await manager.locator("#searchHistory").fill("indexed");
  await waitFor(async () => await manager.locator("#historyEntries button").count() === 1, "History search failed");
  await manager.locator("#historyEntries button").click();
  await waitFor(async () => !(await call({ type: "HISTORY_LIST" })).data.some((url) => url.includes("indexed")), "History deletion was not saved");
  const exportedHistory = manager.waitForEvent("download"); await manager.locator("#exportHistory").click();
  const historyDownload = await exportedHistory;
  assert.ok(Array.isArray(JSON.parse(readFileSync(await historyDownload.path(), "utf8"))));
  await manager.locator("#searchCards").fill("AES key denied"); await manager.locator('[data-tab="available"]').click();
  await waitFor(async () => await manager.locator("#available .card").count() === 1, "Failed card missing in manager");
  const denied = (await call({ type: "GET_STATE" })).data.cards.find((card) => card.title === "AES key denied"), previousDebugId = denied.debugLogId;
  await manager.locator("#available .batch-select").check(); await manager.locator("#retryAll").click();
  await waitFor(async () => (await getCard(denied.id)).debugLogId !== previousDebugId && (await getCard(denied.id)).status === "error", "Batch retry did not dispatch the failed task");
  const optionsPage = await context.newPage(); optionsPage.on("pageerror", (error) => errors.push(error.message));
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.locator("#siteOrigin").fill(base);
  await optionsPage.locator("#site-credentials").uncheck(); await optionsPage.locator("#site-native").uncheck();
  await optionsPage.locator("#maxActiveDownloads").fill("3"); await optionsPage.locator("#addSite").click(); await optionsPage.locator("#saveBtn").click();
  await waitFor(async () => (await call({ type: "GET_SETTINGS" })).data.maxActiveDownloads === 3, "Concurrency setting did not save");
  assert.equal((await call({ type: "GET_SETTINGS" })).data.sitePolicies[base].credentials, false);
  await optionsPage.locator("#nativeCheck").click();
  await waitFor(async () => (await optionsPage.locator("#nativeHealth").textContent()).includes("Native disabled"), "Native health error was not shown");
  const credentialFree = await ingest("Credential-free direct", "direct.mp4?no-cookie=1", "mp4"); await complete(credentialFree);
  assert.ok((await getCard(credentialFree.id)).lastValidation.ok);
  // Real manager batch controls stop and resume both running and queued streams.
  const batchA = await ingest("Manager slow A", "slow.m3u8?manager=a"), batchB = await ingest("Manager slow B", "slow.m3u8?manager=b");
  await manager.locator("#searchCards").fill("Manager slow"); await manager.locator('[data-tab="available"]').click();
  await waitFor(async () => await manager.locator("#available .card").count() === 2, "Manager search failed");
  for (const input of await manager.locator("#available .batch-select").all()) await input.check();
  await manager.locator("#batchDownload").click();
  await manager.locator('[data-tab="downloading"]').click();
  await waitFor(async () => await manager.locator("#downloading .card").count() === 2, "Manager batch queue missing");
  const prioritized = (await getCard(batchA.id)).status === "queued" ? batchA : batchB;
  await manager.locator(`.card[data-card-id="${prioritized.id}"] .priority-btn`).click();
  for (const input of await manager.locator("#downloading .batch-select").all()) await input.check();
  await manager.locator("#pauseAll").click();
  try { await waitFor(async () => (await getCard(batchA.id)).status === "paused" && (await getCard(batchB.id)).status === "paused", "Batch pause failed", 5000); }
  catch (error) { console.log("Batch pause diagnostics", [ (await getCard(batchA.id)).status, (await getCard(batchB.id)).status ], await manager.locator("#managementError").textContent()); throw error; }
  assert.ok((await getCard(prioritized.id)).debugReport.includes("prioritized"));
  await manager.locator("#clearTask").click();
  await manager.locator("#resumeAll").click();
  await waitFor(async () => ["downloading", "queued"].includes((await getCard(batchA.id)).status), "Batch resume failed");
  await manager.locator("#cancelAll").click();
  await waitFor(async () => (await getCard(batchA.id)).status === "available" && (await getCard(batchB.id)).status === "available", "Batch cancel failed");
  await manager.locator("#inspect").click(); await manager.locator("#cleanup").click();
  await optionsPage.locator("#site-detection").uncheck(); await optionsPage.locator("#addSite").click(); await optionsPage.locator("#saveBtn").click();
  await waitFor(async () => (await call({ type: "GET_SETTINGS" })).data.sitePolicies[base].detection === false, "Website detection control did not save");
  await call({ type: "DETECTED_CANDIDATES", pageUrl: base, candidates: [{ url: `${base}/direct.mp4?disabled=1`, type: "mp4", title: "Disabled detection", identityKey: "disabled" }] });
  assert.ok(!(await call({ type: "GET_STATE" })).data.cards.some((card) => card.title === "Disabled detection"));
  await manager.locator("#rescanBtn").click();
  await manager.screenshot({ path: join(work, "manager.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("Manager preview/history/storage/batch controls, site policies and Native health UI passed");
  console.log(JSON.stringify({ ok: true, originalCardsRetained: true, multiPeriodDash: true, sidxDash: true, dynamicDash: true, fullManager: true, batchControls: true, sitePolicies: true, credentialFreeDirect: true, historyManagement: true, nativeHealthUi: true, resetSavedStreamOptions: true, aes128Hls: true, aesKeyDeniedAndDrmErrors: true, iframeAndDynamicShadow: true, dashAudioVideo: true, selectedAudioOnly: true, segmentedSubtitles: true, timedLiveClip: true, oversizedResource: true, insufficientSpace: true, queueCancelAndRelease: true, searchSortBatch: true, temporaryArtifacts: work }, null, 2));
} finally { await context?.close(); await new Promise((resolve) => server.close(resolve)); }
