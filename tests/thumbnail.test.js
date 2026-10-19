import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { shouldReplaceThumbnail } from "../core/media/should-replace-thumbnail.js";
import { capturePlayerView } from "../extension/background/capture-player-view.js";

function fixture() {
  let draws = 0;
  const video = { src: "a.mp4", currentSrc: "a.mp4", poster: "", readyState: 1, videoWidth: 160, videoHeight: 90 };
  const context = vm.createContext({ video, Date, setTimeout, clearTimeout,
    absoluteUrl: (url) => url, createPlaceholderThumbnail: () => "data:image/svg+xml;base64,placeholder",
    document: { createElement: () => ({ getContext: () => ({ drawImage() { draws++; } }), toDataURL: () => `data:image/jpeg;base64,frame${draws}` }) },
    Image: class { naturalWidth = 100; naturalHeight = 100; set src(url) { queueMicrotask(() => url === "bad.jpg" ? this.onerror() : this.onload()); } }
  });
  for (const name of ["thumbnail-debug", "capture-frame-thumbnail", "load-poster-thumbnail", "build-thumbnail"]) vm.runInContext(readFileSync(`extension/content/${name}.js`, "utf8"), context);
  return { video, context, build: () => vm.runInContext('buildThumbnail(video, "mp4")', context), draws: () => draws };
}
test("metadata-only player retries after decoded data; frame cache resets on source change", async () => {
  const f = fixture();
  assert.match(await f.build(), /svg/); assert.equal(f.draws(), 0);
  f.video.readyState = 2;
  const first = await f.build(); assert.match(first, /jpeg/);
  assert.equal(await f.build(), first); assert.equal(f.draws(), 1);
  f.video.currentSrc = "b.mp4";
  assert.notEqual(await f.build(), first); assert.equal(f.draws(), 2);
});
test("broken poster retries with real frames; valid poster is upgraded when video loads", async () => {
  const f = fixture(); f.video.poster = "bad.jpg";
  assert.match(await f.build(), /svg/);
  assert.equal(vm.runInContext('getThumbnailDebug(video).entries.some(e => e.stage === "poster-failed")', f.context), true);
  f.video.poster = "good.jpg"; assert.equal(await f.build(), "good.jpg");
  f.video.readyState = 2; assert.match(await f.build(), /jpeg/);
});
test("seeking cannot permanently cache an unready frame", async () => {
  const f = fixture(); f.video.readyState = 4; f.video.seeking = true;
  assert.match(await f.build(), /svg/); assert.equal(f.draws(), 0);
  f.video.seeking = false; assert.match(await f.build(), /jpeg/);
});
test("new actual thumbnail replaces old actual thumbnail but never regresses to placeholder", () => {
  assert.equal(shouldReplaceThumbnail("old.jpg", "data:image/jpeg;base64,new"), true);
  assert.equal(shouldReplaceThumbnail("old.jpg", "data:image/svg+xml;base64,placeholder"), false);
});
test("visible capture refuses iframe/inactive players and discards capture after a tab switch", async () => {
  await assert.rejects(capturePlayerView({ tab: { id: 1 }, frameId: 2 }), /top-level/);
  let captured = 0;
  const tab = { id: 1, url: "https://example.com/video", active: false, windowId: 2 };
  globalThis.chrome = { tabs: { get: async () => tab, captureVisibleTab: async () => { captured++; return "data:image/jpeg;base64,capture"; }, query: async () => [{ ...tab, id: 3 }] } };
  await assert.rejects(capturePlayerView({ tab: { ...tab } }), /not active/);
  assert.equal(captured, 0);
  tab.active = true;
  await assert.rejects(capturePlayerView({ tab: { ...tab } }), /changed during capture/);
  assert.equal(captured, 1);
  delete globalThis.chrome;
});
