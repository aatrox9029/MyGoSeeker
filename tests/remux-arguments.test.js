import test from "node:test";
import assert from "node:assert/strict";
import { buildRemuxArguments } from "../core/remux/build-arguments.js";

test("every local HLS input permits disguised segment suffixes before opening it", () => {
  const args = buildRemuxArguments({ video: { playlistFileName: "video.m3u8" },
    audio: { playlistFileName: "audio.m3u8" }, outputFileName: "out.mp4" });
  for (const name of ["video.m3u8", "audio.m3u8"]) {
    const index = args.indexOf(name);
    assert.deepEqual(args.slice(index - 5, index), ["-protocol_whitelist", "file,pipe,data", "-allowed_extensions", "ALL", "-i"]);
  }
});

test("audio-only HLS gets the override and DASH inputs do not", () => {
  const audio = buildRemuxArguments({ video: { playlistFileName: "audio.m3u8" }, audioOnly: true, outputFileName: "out.m4a" });
  assert.ok(audio.includes("-allowed_extensions"));
  assert.ok(audio.includes("-vn"));
  const dash = buildRemuxArguments({ video: { inputFileName: "video.mp4" }, audio: { inputFileName: "audio.mp4" }, outputFileName: "out.mp4" });
  assert.equal(dash.includes("-allowed_extensions"), false);
  assert.equal(dash.filter((value) => value === "file,pipe,data").length, 2);
});
