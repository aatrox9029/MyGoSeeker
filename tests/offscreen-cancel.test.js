import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { buildRemuxArguments } from "../core/remux/build-arguments.js";

test("cancelling active and queued remux settles both and the next job reloads FFmpeg", async () => {
  let listener, loads = 0, terminateCalls = 0, rejectExec, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const store = new Map();
  const makeJob = (jobPrefix) => ({ jobPrefix, outputFileName: `${jobPrefix}.mp4`, video: { playlistFileName: `${jobPrefix}.m3u8`, playlistText: "#EXTM3U", resources: [] } });
  for (const key of ["active", "queued", "next"]) store.set(key, makeJob(key));
  class FakeFFmpeg {
    on() {}
    async load() { loads++; }
    async writeFile() {}
    async deleteFile() {}
    async exec() {
      if (loads > 1) return 0;
      started();
      return new Promise((_resolve, reject) => { rejectExec = reject; });
    }
    terminate() { terminateCalls++; rejectExec(new Error("terminated")); }
    async readFile() { return new Uint8Array(32); }
  }
  const context = vm.createContext({ FFmpeg: FakeFFmpeg, Blob, TextEncoder, Uint8Array, buildRemuxArguments,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    getBinaryJob: async (key) => store.get(key), putBinaryJob: async (key, value) => store.set(key, value),
    detectContainerSignature: () => "mp4", validateFinalizedMediaBlob: async () => ({ ok: true }),
    chrome: { runtime: { getURL: (value) => value, onMessage: { addListener: (fn) => { listener = fn; } } } }
  });
  vm.runInContext(readFileSync("offscreen.js", "utf8").replace(/^import .*\r?\n/gm, ""), context);
  const send = (type, jobKey) => new Promise((resolve) => listener({ type, jobKey }, {}, resolve));
  const active = send("OFFSCREEN_REMUX_HLS", "active");
  await ready;
  const queued = send("OFFSCREEN_REMUX_HLS", "queued");
  const cancelQueued = send("OFFSCREEN_CANCEL_REMUX", "queued");
  const cancelActive = send("OFFSCREEN_CANCEL_REMUX", "active");
  assert.equal((await active).ok, false);
  assert.equal((await queued).ok, false);
  assert.ok((await cancelActive).ok);
  assert.ok((await cancelQueued).ok);
  assert.ok((await send("OFFSCREEN_REMUX_HLS", "next")).ok);
  assert.equal(loads, 2);
  assert.equal(terminateCalls, 3, "Cancellation and settled jobs must release WASM heaps");
});
