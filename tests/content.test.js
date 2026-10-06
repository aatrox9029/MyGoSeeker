import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("blob recovery never chooses a different video", () => {
  const otherVideo = { currentSrc: "blob:other", src: "blob:other", querySelectorAll: () => [] };
  const context = vm.createContext({ document: { querySelectorAll: () => [otherVideo] } });
  vm.runInContext(readFileSync("extension/content/blob-download.js", "utf8"), context);
  assert.equal(vm.runInContext('findVideoByBlobUrl("blob:missing")', context), null);
  assert.equal(vm.runInContext('findVideoByBlobUrl("blob:other")', context), otherVideo);
});
test("capture setup failure restores original mute and volume", async () => {
  const context = vm.createContext({
    video: { muted: true, volume: 0, captureStream() { throw new Error("capture unavailable"); } }
  });
  vm.runInContext(readFileSync("extension/content/record-video.js", "utf8"), context);
  await assert.rejects(vm.runInContext('recordFromVideoElement(video, "test", "card")', context), /capture unavailable/);
  assert.equal(context.video.muted, true);
  assert.equal(context.video.volume, 0);
});
test("metadata failure releases URL and removes listeners", async () => {
  const listeners = new Map();
  let revoked = false;
  const media = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    set src(_value) { listeners.get("error")(); },
    removeAttribute() {}, load() {}
  };
  const context = vm.createContext({
    setTimeout, clearTimeout,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => { revoked = true; } },
    document: { createElement: () => media }, blob: { size: 100, type: "video/mp4" }
  });
  vm.runInContext(readFileSync("extension/content/blob-download.js", "utf8"), context);
  await assert.rejects(vm.runInContext("validateVideoBlob(blob)", context), /metadata/);
  assert.equal(listeners.size, 0); assert.equal(revoked, true);
});
