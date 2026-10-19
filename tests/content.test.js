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

test("recording pause/resume controls playback and cancellation restores audio without saving", async () => {
  let saved = 0, stoppedTracks = 0, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const listeners = new Map();
  const video = { muted: true, volume: 0, currentTime: 0, paused: false, ended: false, readyState: 4,
    captureStream: () => ({ getAudioTracks: () => [{}], getTracks: () => [{ stop() { stoppedTracks++; } }] }),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name),
    play() { this.paused = false; listeners.get("playing")?.(); return Promise.resolve(); },
    pause() { this.paused = true; listeners.get("pause")?.(); }
  };
  class Recorder {
    static isTypeSupported() { return true; }
    state = "inactive";
    start() { this.state = "recording"; started(); }
    pause() { this.state = "paused"; }
    resume() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.onstop?.(); }
  }
  const context = vm.createContext({ video, MediaRecorder: Recorder, HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    setTimeout, clearTimeout, setInterval, clearInterval,
    resolveEffectiveDuration: () => ({ duration: 120 }), sendBlobProgress: async () => {},
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    saveBlobToFile: async () => { saved++; }
  });
  vm.runInContext(readFileSync("extension/content/task-control.js", "utf8"), context);
  vm.runInContext(readFileSync("extension/content/record-video.js", "utf8"), context);
  vm.runInContext('contentTasks.set("r", { paused: false, cancelled: false, waiters: new Set() })', context);
  const operation = vm.runInContext('recordFromVideoElement(video, "test", "r")', context);
  await ready;
  vm.runInContext('controlContentTask("r", "pause")', context);
  assert.equal(video.paused, true);
  vm.runInContext('controlContentTask("r", "resume")', context);
  assert.equal(video.paused, false);
  vm.runInContext('controlContentTask("r", "cancel")', context);
  await assert.rejects(operation, (error) => error.name === "AbortError");
  assert.equal(video.muted, true);
  assert.equal(video.volume, 0);
  assert.equal(stoppedTracks, 1);
  assert.equal(saved, 0);
  assert.equal(listeners.size, 0);
});
