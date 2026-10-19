import test from "node:test";
import assert from "node:assert/strict";
import { parseMpd } from "../core/dash/parse-mpd.js";
import { parseSidx } from "../core/dash/parse-sidx.js";
import { resolveSegmentBase } from "../core/dash/resolve-segment-base.js";
import { downloadDashPresentation } from "../core/dash/download-presentation.js";
import { captureDynamicDash } from "../core/dash/capture-dynamic.js";
import { buildInputArguments } from "../core/remux/build-input-arguments.js";

const set = '<AdaptationSet mimeType="video/mp4" codecs="avc1"><Representation id="v" bandwidth="1000"><SegmentTemplate duration="1" media="$Number$.m4s" initialization="init.mp4"/></Representation></AdaptationSet>';
test("multi Period timing, inherited resources and independent reset timestamps", async () => {
  const tracks = parseMpd(`<MPD mediaPresentationDuration="PT4S"><Period id="a" duration="PT2S">${set}</Period><Period id="b">${set}</Period></MPD>`, "https://example.com/main.mpd");
  assert.deepEqual(tracks.map((t) => [t.periodId, t.start, t.totalDuration]), [["a", 0, 2], ["b", 2, 2]]);
  const result = await downloadDashPresentation(tracks, "https://example.com/main.mpd", {}, { fetchImpl: async () => new Response(Uint8Array.of(1, 2)), retries: 1 });
  assert.equal(result.video.parts.length, 2); assert.equal(result.video.info.totalDuration, 4);
  assert.ok(buildInputArguments({ concatFileName: "periods.txt" }).includes("concat"));
  assert.throws(() => parseMpd(`<MPD><Period duration="PT2S">${set}</Period><Period start="PT3S" duration="PT2S">${set}</Period></MPD>`, "https://example.com"), /gap\/overlap/);
  const changed = parseMpd(`<MPD><Period duration="PT2S">${set}</Period><Period duration="PT2S">${set.replace('codecs="avc1"', 'codecs="vp09"')}</Period></MPD>`, "https://example.com");
  await assert.rejects(downloadDashPresentation(changed, "https://example.com", {}, { fetchImpl: async () => new Response(Uint8Array.of(1)), retries: 1 }), /codec changed/);
});
function sidx(version = 0, hierarchical = false) {
  const data = new ArrayBuffer(version ? 64 : 56), v = new DataView(data);
  v.setUint32(0, data.byteLength); new Uint8Array(data, 4, 4).set(new TextEncoder().encode("sidx"));
  v.setUint8(8, version); v.setUint32(16, 1000);
  let cursor = 20;
  if (version) { v.setBigUint64(cursor, 2000n); v.setBigUint64(cursor + 8, 4n); cursor += 16; }
  else { v.setUint32(cursor, 2000); v.setUint32(cursor + 4, 4); cursor += 8; }
  v.setUint16(cursor + 2, 2); cursor += 4;
  v.setUint32(cursor, hierarchical ? 0x80000003 : 3); v.setUint32(cursor + 4, 1000);
  v.setUint32(cursor + 12, 5); v.setUint32(cursor + 16, 2000);
  return data;
}
test("sidx v0/v1 exact original-file offsets, 206 resolution and invalid indexes", async () => {
  for (const version of [0, 1]) {
    const buffer = sidx(version), segments = parseSidx(buffer, 100, "https://example.com/file.mp4");
    assert.deepEqual(segments.map((s) => s.byteRange), [{ offset: 100 + buffer.byteLength + 4, length: 3 }, { offset: 103 + buffer.byteLength + 4, length: 5 }]);
    assert.deepEqual(segments.map((s) => s.duration), [1, 2]);
  }
  assert.throws(() => parseSidx(sidx(0, true), 0, "x"), /Hierarchical/);
  assert.throws(() => parseSidx(sidx().slice(0, 20), 0, "x"), /size/);
  const [track] = parseMpd('<MPD mediaPresentationDuration="PT3S"><Period><AdaptationSet mimeType="video/mp4"><Representation><BaseURL>file.mp4</BaseURL><SegmentBase indexRange="100-155"><Initialization range="0-99"/></SegmentBase></Representation></AdaptationSet></Period></MPD>', "https://example.com/main.mpd");
  const resolved = await resolveSegmentBase(track, { fetchImpl: async (_, { headers }) => { assert.equal(headers.get("range"), "bytes=100-155"); return new Response(sidx(), { status: 206, headers: { "content-range": "bytes 100-155/200" } }); } });
  assert.equal(resolved.segments.length, 2); assert.equal(resolved.initSegments[0].byteRange.length, 100);
  assert.equal(resolved.segmentBase, null, "Resolved indexes must not be fetched again after trimming fresh live segments");
});
test("dynamic timing bounds available segments, updates incrementally and detects window gaps", async () => {
  let now = 5000;
  const mpd = `<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" timeShiftBufferDepth="PT3S" minimumUpdatePeriod="PT1S"><Period>${set}</Period></MPD>`;
  const first = parseMpd(mpd, "https://example.com/live.mpd", { now });
  assert.deepEqual(first[0].segments.map((s) => s.startTime), [2, 3, 4]);
  const consumed = [];
  const count = await captureDynamicDash("https://example.com/live.mpd", first, 3, { now: () => now, wait: async (ms) => { now += ms; }, fetchImpl: async () => new Response(mpd) }, async (pair) => consumed.push(...pair.video.segments));
  assert.equal(count, 3); assert.deepEqual(consumed.map((s) => s.startTime), [4, 5, 6]);
  now = 5000;
  await assert.rejects(captureDynamicDash("https://example.com/live.mpd", first, 10, { now: () => now, wait: async () => { now += 5000; }, fetchImpl: async () => new Response(mpd) }, async () => {}), /skipped/);
  assert.throws(() => parseMpd(mpd.replace('availabilityStartTime="1970-01-01T00:00:00Z"', ""), "https://example.com"), /availabilityStartTime/);
  const longTimeline = mpd.replace('duration="1"', '').replace('/></Representation>', '><SegmentTimeline><S t="0" d="1" r="-1"/></SegmentTimeline></SegmentTemplate></Representation>');
  assert.equal(parseMpd(longTimeline, "https://example.com", { now: 100000000 })[0].segments.length, 3);
});
test("SegmentList inherits timing, supports explicit timelines and dynamic windows", () => {
  const text = '<MPD type="dynamic" availabilityStartTime="1970-01-01T00:00:00Z" timeShiftBufferDepth="PT2S"><Period><AdaptationSet mimeType="video/mp4"><SegmentList timescale="10"/><Representation id="v"><SegmentList><SegmentTimeline><S t="20" d="10" r="2"/></SegmentTimeline><SegmentURL media="2.m4s"/><SegmentURL media="3.m4s"/><SegmentURL media="4.m4s"/></SegmentList></Representation></AdaptationSet></Period></MPD>';
  const [track] = parseMpd(text, "https://example.com", { now: 5000 });
  assert.deepEqual(track.segments.map((s) => s.startTime), [3, 4]);
  assert.deepEqual(track.segments.map((s) => s.duration), [1, 1]);
  assert.throws(() => parseMpd(text.replace('<S t="20" d="10" r="2"/>', '<S t="20" d="10"/>'), "https://example.com", { now: 5000 }), /count mismatch/);
});
