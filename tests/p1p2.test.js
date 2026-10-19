import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { createDownloadQueue } from "../core/tasks/download-queue.js";
import { createStateWriter } from "../core/storage/state-writer.js";
import { compactPublicState } from "../core/storage/public-state.js";
import { collectTemporaryFiles, ensureStorageSpace, TEMP_TTL } from "../core/files/storage-maintenance.js";
import { putBinaryJob, getBinaryJob, scanBinaryJobs } from "../core/files/binary-store.js";
import { parseMpd } from "../core/dash/parse-mpd.js";
import { parseMasterPlaylist } from "../core/hls/parse-master.js";
import { expandMasterOptions } from "../core/hls/expand-master.js";
import { chooseOutputFormat } from "../core/remux/output-format.js";
import { buildRemuxArguments } from "../core/remux/build-arguments.js";
import { classifyDownloadError } from "../core/downloads/error-guidance.js";
import { formatDownloadFileName } from "../core/downloads/file-name.js";
import { filterAndSortCards } from "../extension/popup/manage-cards.js";
import { mergeWebVtt } from "../core/subtitles/merge-webvtt.js";
import { createDownloadProgressMonitor } from "../extension/background/download-progress.js";
import { captureLivePlaylist } from "../core/hls/capture-live.js";
import { createSegmentCheckpoint, clearSegmentCheckpoint } from "../core/hls/segment-checkpoint.js";
import { recoverDownloads } from "../extension/background/recover-downloads.js";
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

test("queue keeps reservations until completion, skips blocked work, and cancels pending tasks", async () => {
  const queue = createDownloadQueue({ maxActive: 2, maxBytes: 100 });
  const ran = [];
  queue.enqueue("stream", 90, () => ran.push("stream"));
  queue.enqueue("otherStream", 90, () => ran.push("otherStream"));
  queue.enqueue("direct", 10, () => ran.push("direct"));
  queue.enqueue("cancelled", 10, () => ran.push("cancelled"));
  await tick();
  assert.deepEqual(ran, ["stream", "direct"]); assert.equal(queue.snapshot.reservedBytes, 100);
  assert.ok(queue.cancel("cancelled")); queue.release("stream"); await tick();
  assert.deepEqual(ran, ["stream", "direct", "otherStream"]);
  assert.throws(() => queue.enqueue("tooBig", 101, () => {}), /memory budget/);
  queue.release("direct"); queue.release("otherStream"); assert.equal(queue.snapshot.reservedBytes, 0);
});
test("worker restart turns persisted queued tasks into resumable paused tasks without silently starting work", async () => {
  const cards = { queued: { id: "queued", status: "queued" } };
  assert.ok(await recoverDownloads(cards, { downloads: {}, tabs: {} }));
  assert.equal(cards.queued.status, "paused"); assert.match(cards.queued.stage, /resume/);
});
test("state writer coalesces progress and serializes a terminal flush", async () => {
  let writes = 0, simultaneous = 0, maximum = 0, progress = 0, saved;
  const writer = createStateWriter(async () => { maximum = Math.max(maximum, ++simultaneous); await tick(); writes++; saved = progress; simultaneous--; }, 15);
  for (let i = 0; i < 100; i++) { progress = i; writer.schedule(); }
  await writer.flush(); assert.equal(writes, 1); assert.equal(saved, 99);
  progress = 100; await Promise.all([writer.flush(), writer.flush()]); assert.equal(maximum, 1); assert.equal(saved, 100);
});
test("compact state sends changed cards and removals without debug report bodies", () => {
  const full = { cards: [{ id: "a", updatedAt: 1, variants: [], debugReport: "long report" }], settings: {} };
  const first = compactPublicState(full); assert.equal(first.cards.length, 1); assert.equal(first.cards[0].debugReport, undefined);
  assert.equal(compactPublicState(full, first.versions).cards.length, 0);
  full.cards[0].title = "new discovery"; assert.equal(compactPublicState(full, first.versions).cards.length, 1);
  full.cards = []; assert.deepEqual(compactPublicState(full, first.versions).removed, ["a"]);
});
test("temporary cleanup preserves live/recent paused checkpoints and reclaims orphan/expired data", async () => {
  for (const id of ["live", "paused", "expired", "orphan"]) await putBinaryJob(`hls:${id}:v:video:segment:0`, { bytes: new ArrayBuffer(3) });
  await putBinaryJob("job-active", { cardId: "live" });
  const now = Date.now();
  const result = await collectTemporaryFiles({ live: { id: "live", status: "downloading" }, paused: { id: "paused", status: "paused", updatedAt: now }, expired: { id: "expired", status: "paused", updatedAt: now - TEMP_TTL - 1 } });
  assert.equal(result.removed, 2);
  assert.ok(await getBinaryJob("hls:live:v:video:segment:0")); assert.ok(await getBinaryJob("job-active"));
  assert.equal(await getBinaryJob("hls:expired:v:video:segment:0"), undefined);
  await scanBinaryJobs(() => true);
});
test("storage preflight fails early when quota is insufficient", async () => {
  await assert.rejects(ensureStorageSpace(100, async () => ({ usage: 950, quota: 1000 })), /Insufficient storage/);
  await ensureStorageSpace(100, async () => ({ usage: 0, quota: 100 * 1024 * 1024 }));
});
test("global storage accounting rejects concurrent over-cap writes and rolls back failed records", async () => {
  await scanBinaryJobs(() => true);
  const db = await new Promise((resolve) => { const request = indexedDB.open("mygoseeker-binary-v1", 1); request.onsuccess = () => resolve(request.result); });
  await new Promise((resolve) => { const transaction = db.transaction("jobs", "readwrite"); transaction.objectStore("jobs").put(512 * 1024 * 1024 - 3, "__usage__"); transaction.oncomplete = resolve; });
  db.close();
  const results = await Promise.allSettled([putBinaryJob("fits", { bytes: new ArrayBuffer(3) }), putBinaryJob("overflow", { bytes: new ArrayBuffer(3) })]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.match(results.find((item) => item.status === "rejected").reason.message, /capacity limit/);
  assert.equal(await getBinaryJob("overflow"), undefined);
  assert.equal((await scanBinaryJobs()).bytes, 3);
  await scanBinaryJobs(() => true);
});
test("live capture downloads changing sliding windows immediately and detects missing sequence gaps", async () => {
  const first = "#EXTM3U\n#EXT-X-TARGETDURATION:0.1\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:1,\na.ts\n";
  let requests = [];
  const options = { checkpoint: await createSegmentCheckpoint("live-test", "v"), stagePrefix: "video", maxBytes: 100, retries: 1,
    fetchImpl: async (url) => { requests.push(url); return url.endsWith("m3u8") ? new Response(first.replace("SEQUENCE:10", "SEQUENCE:11").replace("a.ts", "b.ts")) : new Response(Uint8Array.of(1, 2, 3)); } };
  const result = await captureLivePlaylist("https://example.com/live.m3u8", first, 2, options);
  assert.equal(result.info.segments.length, 2); assert.equal(result.info.totalDuration, 2); assert.equal(result.resources.length, 2);
  assert.deepEqual(requests.map((url) => url.split("/").at(-1)), ["a.ts", "live.m3u8", "b.ts"]);
  await clearSegmentCheckpoint("live-test");
  options.checkpoint = await createSegmentCheckpoint("live-gap", "v");
  options.fetchImpl = async (url) => url.endsWith("m3u8") ? new Response(first.replace("SEQUENCE:10", "SEQUENCE:12").replace("a.ts", "c.ts")) : new Response(Uint8Array.of(1));
  await assert.rejects(captureLivePlaylist("https://example.com/live.m3u8", first, 2, options), /skipped segments/);
  await clearSegmentCheckpoint("live-gap");
});
const mpd = (content) => `<MPD mediaPresentationDuration="PT6S"><Period><AdaptationSet mimeType="video/mp4" codecs="avc1.64001f"><Representation id="v" bandwidth="1000" height="720">${content}</Representation></AdaptationSet></Period></MPD>`;
test("DASH resolves inherited templates, padded numbers, timelines and lists/ranges", () => {
  let [track] = parseMpd(mpd('<SegmentTemplate timescale="1" duration="2" media="$RepresentationID$-$Number%03d$.m4s" initialization="init.mp4"/>'), "https://example.com/nested/main.mpd");
  assert.equal(track.segments.length, 3); assert.equal(track.segments[2].url, "https://example.com/nested/v-003.m4s");
  [track] = parseMpd(mpd('<SegmentTemplate timescale="10" media="$Time$.m4s"><SegmentTimeline><S t="10" d="20" r="-1"/><S t="50" d="10"/></SegmentTimeline></SegmentTemplate>'), "https://example.com/main.mpd");
  assert.deepEqual(track.segments.map((item) => item.url.split("/").at(-1)), ["10.m4s", "30.m4s", "50.m4s"]);
  [track] = parseMpd(mpd('<BaseURL>file.mp4</BaseURL><SegmentList duration="3"><Initialization range="0-9"/><SegmentURL mediaRange="10-19"/><SegmentURL mediaRange="20-29"/></SegmentList>'), "https://example.com/main.mpd");
  assert.deepEqual(track.segments[0].byteRange, { offset: 10, length: 10 });
});
test("DASH rejects DRM, malformed Periods/indexes and malicious/unbounded XML with actionable errors", () => {
  for (const text of [mpd('<ContentProtection/>'), mpd('<SegmentBase/>'), mpd('<SegmentTemplate media="$Number$.m4s"/>'), '<!DOCTYPE MPD><MPD/>', '<MPD><Period/><Period/></MPD>', '<MPD type="dynamic"><Period/></MPD>']) assert.throws(() => parseMpd(text, "https://example.com/main.mpd"));
});
test("HLS discovery preserves multiple languages, subtitle tracks and codec metadata", () => {
  const text = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",LANGUAGE="en",NAME="English",DEFAULT=YES,URI="en.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",LANGUAGE="ja",NAME="Japanese",URI="ja.m3u8"\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",LANGUAGE="en",NAME="English",URI="sub.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000,CODECS="avc1.4d001f,mp4a.40.2",AUDIO="a",SUBTITLES="s"\nv.m3u8';
  const options = parseMasterPlaylist(text, "https://example.com/master.m3u8");
  const [variant] = expandMasterOptions({}, options, "master", "key");
  assert.equal(variant.audioTracks.length, 2); assert.equal(variant.subtitleTracks[0].uri, "https://example.com/sub.m3u8"); assert.match(variant.codecs, /avc1/);
});
test("container and FFmpeg arguments follow selected codecs and audio-only output", () => {
  assert.equal(chooseOutputFormat("avc1.4d001f,mp4a.40.2").extension, "mp4");
  assert.equal(chooseOutputFormat("mp4a.40.2", true).extension, "m4a");
  assert.equal(chooseOutputFormat("vp09,opus").extension, "webm");
  assert.throws(() => chooseOutputFormat("avc1,opus"), /mixed codecs/);
  const args = buildRemuxArguments({ video: { playlistFileName: "audio.m3u8" }, audioOnly: true, outputFormat: { container: "webm" }, outputFileName: "audio.webm" });
  assert.ok(args.includes("-vn")); assert.ok(!args.includes("-movflags"));
});
test("segmented WebVTT merges timestamp maps and removes duplicate cues", () => {
  const chunks = [0, 0, 2].map((seconds) => `WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${90000 + seconds * 90000}\n\n00:00:00.000 --> 00:00:01.000\nHello\n`);
  const result = mergeWebVtt(chunks); assert.equal((result.match(/Hello/g) || []).length, 2); assert.match(result, /00:00:02.000 --> 00:00:03.000/);
});
test("management search/sort, safe filename rules and error categories", () => {
  const cards = [{ title: "B", variants: [], createdAt: 1 }, { title: "A", variants: [], createdAt: 2 }];
  assert.equal(filterAndSortCards(cards, "a", "title")[0].title, "A");
  assert.equal(formatDownloadFileName({ title: "CON", id: "id" }, {}, "mp4"), "_CON.mp4");
  assert.equal(formatDownloadFileName({ title: "A/B", id: "id" }, { label: "720p" }, "mp4", "{title}-{quality}"), "A_B-720p.mp4");
  for (const [error, kind] of [["HTTP 403", "auth"], ["Fetch timed out", "network"], ["FFmpeg unsupported codec", "codec"], ["FILE_NO_SPACE", "storage"]]) assert.equal(classifyDownloadError(error), kind);
});
test("download progress sampling computes speed and ETA without onChanged byte events", async () => {
  const card = { id: "a", status: "downloading", activeDownloadId: 1 };
  let bytes = 100, patch;
  const monitor = createDownloadProgressMonitor({ getCards: () => [card], downloads: { search: async () => [{ id: 1, state: "in_progress", bytesReceived: bytes, totalBytes: 1000 }] }, setCardStatus: async (_, value) => { patch = value; } });
  await monitor.poll(); await tick(); bytes = 200; await monitor.poll();
  assert.ok(patch.speed > 0); assert.ok(patch.eta > 0); assert.equal(patch.progress, 20);
});
