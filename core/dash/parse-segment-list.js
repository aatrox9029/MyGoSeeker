import { xmlChild, xmlChildren } from "./xml-tree.js";
export function parseSegmentList(lists, baseUrl, timing, live, parseRange) {
  const attrs = Object.assign({}, ...lists.map((node) => node.attrs));
  const scale = Number(attrs.timescale || 1), length = Number(attrs.duration || 0), offset = Number(attrs.presentationTimeOffset || 0);
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(offset)) throw new Error("Invalid DASH SegmentList timing");
  const list = lists.at(-1), entries = xmlChildren(list, "SegmentURL");
  if (entries.length > 10000) throw new Error("DASH segment count exceeds limit");
  const timeline = lists.map((node) => xmlChild(node, "SegmentTimeline")).filter(Boolean).at(-1);
  const times = [];
  if (timeline) {
    let time = 0;
    for (const entry of xmlChildren(timeline, "S")) {
      time = entry.attrs.t === undefined ? time : Number(entry.attrs.t);
      const duration = Number(entry.attrs.d), repeat = Number(entry.attrs.r || 0);
      const count = repeat === -1 ? entries.length - times.length : repeat + 1;
      if (!Number.isFinite(time) || !(duration > 0) || !Number.isInteger(count) || count < 1 || times.length + count > entries.length) throw new Error("Invalid DASH SegmentList timeline");
      for (let i = 0; i < count; i++) { times.push({ time, duration }); time += duration; }
    }
    if (times.length !== entries.length) throw new Error("DASH SegmentList timeline/resource count mismatch");
  } else {
    if (live && !(length > 0 && attrs.startNumber !== undefined)) throw new Error("Dynamic DASH SegmentList needs a timeline or duration/startNumber");
    const first = live ? Number(attrs.startNumber) - 1 : 0;
    if (!Number.isSafeInteger(first) || first < 0) throw new Error("Invalid DASH SegmentList startNumber");
    for (let i = 0; i < entries.length; i++) times.push({ time: (first + i) * length, duration: length || timing.duration * scale / entries.length });
  }
  const segments = entries.map((item, index) => ({ url: new URL(item.attrs.media || "", baseUrl).href, byteRange: parseRange(item.attrs.mediaRange),
    duration: times[index].duration / scale, startTime: timing.start + (times[index].time - offset) / scale }));
  const init = lists.map((node) => xmlChild(node, "Initialization")).filter(Boolean).at(-1);
  return { segments: live ? segments.filter((s) => s.startTime + s.duration <= live.end && s.startTime + s.duration > live.start) : segments,
    initSegments: init ? [{ url: new URL(init.attrs.sourceURL || "", baseUrl).href, byteRange: parseRange(init.attrs.range) }] : [] };
}
