import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { createDownloadQueue } from "../core/tasks/download-queue.js";
import { createDiscoveryCache } from "../core/media/discovery-cache.js";
import { normalizeSitePolicies, getSitePolicy } from "../core/settings/site-policy.js";
import { createAdaptiveConcurrency } from "../core/network/adaptive-concurrency.js";
import { fetchWithRetry } from "../core/network/fetch-retry.js";
import { validateOutputTracks } from "../core/remux/validate-output-tracks.js";
import { createStorageManager } from "../extension/background/storage-manager.js";
import { putBinaryJob, getBinaryJob } from "../core/files/binary-store.js";
import { buildRemuxJob } from "../core/hls/merge-renditions.js";
import { checkEstimatedStreamSize } from "../core/downloads/stream-size.js";
import { classifyDownloadError } from "../core/downloads/error-guidance.js";
test("Period resources with reset indexes get unique local filenames; preflight rejects large streams", () => {
  const resource = (kind, index) => ({ kind, index, sourceUrl: `https://example.com/${kind}.m4s`, bytes: new ArrayBuffer(1) });
  const job = buildRemuxJob({ videoPlaylistText: "#EXTM3U", videoPlaylistInfo: {}, videoResources: [resource("init", 0), resource("segment", 0), resource("init", 0), resource("segment", 0)] });
  assert.equal(new Set(job.video.resources.map((r) => r.fileName)).size, 4);
  assert.throws(() => checkEstimatedStreamSize(257 * 1024 * 1024), /Native helper/);
  assert.equal(classifyDownloadError("Stream exceeds safe browser remux limit. Enable Native helper."), "storage");
  assert.equal(classifyDownloadError("Native host unavailable"), "native");
});
test("queue concurrency updates and explicit priority order preserve reservations", async () => {
  const queue = createDownloadQueue({ maxActive: 1, maxBytes: 100 });
  const order = [];
  for (const id of ["a", "b", "c"]) queue.enqueue(id, 10, () => order.push(id));
  queue.prioritize("c"); queue.release("a"); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(order, ["a", "c"]); queue.configure(2); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(order, ["a", "c", "b"]); assert.equal(queue.snapshot.maxActive, 2);
});
test("discovery cache shares work, returns isolated data, expires and retries failed parses", async () => {
  let now = 0, calls = 0;
  const cache = createDiscoveryCache({ now: () => now, ttl: 10 });
  const load = async () => { calls++; return [{ id: "a" }]; };
  const [a, b] = await Promise.all([cache.get("u", load), cache.get("u", load)]);
  a[0].id = "changed"; assert.equal(b[0].id, "a"); assert.equal(calls, 1);
  now = 11; await cache.get("u", load); assert.equal(calls, 2);
  await assert.rejects(cache.get("bad", () => { throw new Error("parse"); }));
  assert.deepEqual(await cache.get("bad", load), [{ id: "a" }]); assert.equal(cache.metrics.hits, 1);
});
test("website policy validates exact origins and independently controls detection, credentials and native", () => {
  const policies = normalizeSitePolicies({ "https://site.example": { detection: false, credentials: false, native: false }, "javascript:alert(1)": {}, "https://site.example/path": {}, "https://invalid.example": null });
  assert.equal(Object.keys(policies).length, 1);
  assert.equal(getSitePolicy({ sitePolicies: policies }, "https://site.example/video").credentials, false);
  assert.equal(getSitePolicy({ sitePolicies: policies }, "https://other.example").detection, true);
});
test("adaptive concurrency reduces slow traffic and ramps within cap; fetch honors cookie omission", async () => {
  const value = createAdaptiveConcurrency(4); value.observe(true, 1); assert.equal(value.limit, 2);
  for (let i = 0; i < 16; i++) value.observe(false, 1); assert.equal(value.limit, 4);
  value.observe(false, 11000); assert.equal(value.limit, 2);
  await fetchWithRetry("https://example.com", "text", { credentials: "omit", fetchImpl: async (_, options) => { assert.equal(options.credentials, "omit"); return new Response("ok"); } });
});
test("output track validation never accepts input-only diagnostics or missing selected audio", () => {
  assert.equal(validateOutputTracks(["Input #0", "Stream #0:0: Video: h264"]).tracksValid, false);
  const lines = ["Output #0, mp4", "Stream #0:0: Video: h264"];
  assert.equal(validateOutputTracks(lines).tracksValid, true); assert.equal(validateOutputTracks(lines, { audio: true }).tracksValid, false);
});
test("storage manager reports per-task usage, rejects active deletion and permits paused cleanup", async () => {
  const manager = createStorageManager(() => ({ active: { id: "active", status: "downloading" }, paused: { id: "paused", status: "paused" } }));
  await putBinaryJob("hls:paused:v:video:segment:0", { bytes: new ArrayBuffer(7) });
  assert.equal((await manager("stats")).tasks.paused, 7);
  await assert.rejects(manager("clear-task", "active"), /Pause/);
  await manager("clear-task", "paused"); assert.equal(await getBinaryJob("hls:paused:v:video:segment:0"), undefined);
});
