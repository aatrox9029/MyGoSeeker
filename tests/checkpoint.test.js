import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { createSegmentCheckpoint, clearSegmentCheckpoint, readSegmentResource } from "../core/hls/segment-checkpoint.js";
import { downloadMediaPlaylistResources } from "../core/hls/download-segments.js";
import { fetchWithRetry } from "../core/network/fetch-retry.js";
import { operationError } from "../core/tasks/operation-control.js";

test("failed HLS retries reuse disk segments and return metadata rather than buffers", async () => {
  const playlist = { segments: ["a", "b", "c"].map((name) => ({ url: `https://example.com/${name}.ts`, duration: 1 })) };
  const calls = [];
  let fail = true;
  const options = { stagePrefix: "video", retries: 1, concurrency: 1, fetchImpl: async (url) => {
    calls.push(url);
    if (fail && url.endsWith("b.ts")) throw new Error("Offline");
    return new Response(Uint8Array.of(1, 2, 3));
  } };
  await assert.rejects(downloadMediaPlaylistResources(playlist, { ...options, checkpoint: await createSegmentCheckpoint("resume", "v") }), /Offline/);
  fail = false;
  const resources = await downloadMediaPlaylistResources(playlist, { ...options, checkpoint: await createSegmentCheckpoint("resume", "v") });
  assert.equal(calls.filter((url) => url.endsWith("a.ts")).length, 1);
  assert.ok(resources.every((item) => item.storageKey && !item.bytes));
  assert.deepEqual([...new Uint8Array(await readSegmentResource(resources[0]))], [1, 2, 3]);
  await clearSegmentCheckpoint("resume");
  await assert.rejects(readSegmentResource(resources[0]), /missing/);
});

test("changed playlists invalidate checkpoints and shared video/audio byte budget is enforced", async () => {
  const checkpoint = await createSegmentCheckpoint("limit", "v", undefined, 5);
  const item = { url: "https://example.com/a", index: 0, kind: "segment" };
  await checkpoint.prepare([item], "video", {});
  await checkpoint.save(item, new ArrayBuffer(3), "video");
  await assert.rejects(checkpoint.save(item, new ArrayBuffer(3), "audio"), /safe browser remux limit/);
  const replacement = await createSegmentCheckpoint("limit", "v");
  await replacement.prepare([item], "video", { mediaSequence: 1 });
  assert.equal(await replacement.load(item, "video"), null);
  await clearSegmentCheckpoint("limit");
});

test("oversized streamed responses stop reading before buffering an entire resource", async () => {
  let cancelled = false;
  await assert.rejects(fetchWithRetry("https://example.com/a", "arrayBuffer", { maxBytes: 4, retries: 1,
    fetchImpl: async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(5)); }, cancel() { cancelled = true; } }))
  }), /safe buffer limit/);
  assert.ok(cancelled);
});

test("external cancellation aborts in-flight requests and Retry-After waits without retrying", async () => {
  for (const waiting of [false, true]) {
    const controller = new AbortController();
    let calls = 0;
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    const operation = fetchWithRetry("https://example.com/a", "text", { signal: controller.signal, fetchImpl: async (_url, { signal }) => {
      calls++;
      started();
      if (waiting) return new Response("busy", { status: 429, headers: { "retry-after": "30" } });
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    } });
    await ready;
    if (waiting) await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort(operationError("pause"));
    await assert.rejects(operation, (error) => error.name === "AbortError" && error.action === "pause");
    assert.equal(calls, 1);
  }
});
