import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { putBinaryJob, getBinaryJob, deleteBinaryJob } from "../core/files/binary-store.js";
import { remuxHlsInOffscreen } from "../core/remux/offscreen-client.js";

test("binary store preserves ArrayBuffers and deletion", async () => {
  await putBinaryJob("test", { bytes: Uint8Array.of(1,2,255).buffer });
  assert.deepEqual([...new Uint8Array((await getBinaryJob("test")).bytes)], [1,2,255]);
  await deleteBinaryJob("test");
  assert.equal(await getBinaryJob("test"), undefined);
});
test("remux sends only JSON identifiers, shares offscreen creation, and cleans storage", async () => {
  let created = 0;
  globalThis.chrome = {
    runtime: {
      getURL: (value) => value, getContexts: async () => [],
      sendMessage: async (message) => {
        assert.equal(message.target, "offscreen");
        assert.ok(!("job" in message));
        const job = await getBinaryJob(message.jobKey);
        assert.equal(job.video.bytes.byteLength, 3);
        await putBinaryJob(`${message.jobKey}:result`, { objectUrl: "blob:test", validation: { ok: true } });
        return { ok: true };
      }
    }, offscreen: { createDocument: async () => { created++; await new Promise((resolve) => setTimeout(resolve, 10)); } }
  };
  await Promise.all(["one", "two"].map((jobPrefix) => remuxHlsInOffscreen({ jobPrefix, video: { bytes: Uint8Array.of(1,2,3).buffer } })));
  assert.equal(created, 1);
  assert.equal(await getBinaryJob("one"), undefined);
  assert.equal(await getBinaryJob("one:result"), undefined);
  chrome.runtime.sendMessage = async () => ({ ok: false, error: "failed remux" });
  await assert.rejects(remuxHlsInOffscreen({ jobPrefix: "failure" }), /failed remux/);
  assert.equal(await getBinaryJob("failure"), undefined);
});
