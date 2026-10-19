import { parseXmlTree, xmlChild, xmlChildren } from "./xml-tree.js";
import { parseIsoDuration, resolvePeriodTiming } from "./period-timing.js";
import { parseSegmentList } from "./parse-segment-list.js";
export { parseIsoDuration } from "./period-timing.js";
function templateUrl(template, rep, number, time, base) {
  const value = template.replace(/\$\$/g, "\u0000").replace(/\$(RepresentationID|Bandwidth|Number|Time)(?:%0(\d+)d)?\$/g, (_, name, width) => String(({ RepresentationID: rep.id, Bandwidth: rep.bandwidth, Number: number, Time: time })[name]).padStart(Number(width) || 0, "0")).replace(/\u0000/g, "$");
  if (/\$[A-Za-z]/.test(value)) throw new Error("Unsupported DASH URL template");
  return new URL(value, base).href;
}
function buildTrack(nodes, duration, base, timing, live) {
  const rep = nodes.at(-1).attrs;
  let url = base;
  for (const node of nodes) { const own = xmlChild(node, "BaseURL"); if (own) url = new URL(own.text.trim(), url).href; }
  const attrs = Object.assign({}, ...nodes.map((node) => node.attrs));
  const track = { ...timing, periodId: timing.id, periodIndex: timing.index, id: rep.id || url, url, codecs: attrs.codecs || "", language: attrs.lang || "", bandwidth: Number(attrs.bandwidth) || 0, height: Number(attrs.height) || 0,
    kind: attrs.contentType || (attrs.mimeType || "").split("/")[0] || (attrs.height ? "video" : "audio"), segments: [], initSegments: [], totalDuration: duration, baseUrl: url, mediaSequence: 0, isEndList: true, segmentExtensions: ["m4s"] };
  const addressing = nodes.flatMap((node) => node.children.filter((child) => ["SegmentTemplate", "SegmentList", "SegmentBase"].includes(child.name))).at(-1)?.name;
  const templates = addressing === "SegmentTemplate" ? nodes.map((node) => xmlChild(node, "SegmentTemplate")).filter(Boolean) : [];
  const lists = addressing === "SegmentList" ? nodes.map((node) => xmlChild(node, "SegmentList")).filter(Boolean) : [];
  if (templates.length) {
    const options = Object.assign({}, ...templates.map((node) => node.attrs));
    const scale = Number(options.timescale || 1), start = Number(options.startNumber || 1);
    if (!(scale > 0) || !Number.isFinite(scale) || !Number.isSafeInteger(start) || start < 0 || !options.media) throw new Error("Invalid DASH SegmentTemplate");
    if (options.initialization) track.initSegments.push({ url: templateUrl(options.initialization, rep, start, 0, url) });
    const timeline = templates.map((node) => xmlChild(node, "SegmentTimeline")).filter(Boolean).at(-1);
    const add = (number, time, length) => {
      if (track.segments.length >= 10000) throw new Error("DASH segment count exceeds limit");
      const startTime = timing.start + (time - Number(options.presentationTimeOffset || 0)) / scale;
      if (live && (startTime + length / scale > live.end || startTime + length / scale <= live.start)) return;
      track.segments.push({ url: templateUrl(options.media, rep, number, time, url), duration: length / scale, startTime, number });
    };
    if (timeline) {
      const entries = xmlChildren(timeline, "S"); let time = 0, number = start;
      entries.forEach((entry, index) => {
        const length = Number(entry.attrs.d); time = entry.attrs.t === undefined ? time : Number(entry.attrs.t);
        if (!(length > 0) || !Number.isFinite(time)) throw new Error("Invalid DASH timeline");
        const repeat = Number(entry.attrs.r || 0);
        const end = Number(entries[index + 1]?.attrs.t ?? duration * scale + Number(options.presentationTimeOffset || 0));
        const count = repeat >= 0 ? repeat + 1 : Math.ceil((end - time) / length);
        if (!(count > 0) || !Number.isSafeInteger(count)) throw new Error("Unbounded DASH timeline");
        const skip = live ? Math.min(count, Math.max(0, Math.floor(((live.start - timing.start) * scale + Number(options.presentationTimeOffset || 0) - time) / length))) : 0;
        if (count - skip > 10000) throw new Error("Unbounded DASH timeline");
        for (let i = skip; i < count; i++) add(number + i, time + i * length, length);
        number += count; time += count * length;
      });
    } else {
      const length = Number(options.duration);
      if (!(length > 0) || !(duration > 0)) throw new Error("DASH duration is required");
      const offset = Number(options.presentationTimeOffset || 0);
      const count = Math.ceil((duration * scale + offset) / length);
      const first = live ? Math.max(0, Math.floor(((live.start - timing.start) * scale + offset) / length)) : 0;
      if (count - first > 10000) throw new Error("DASH segment count exceeds limit");
      for (let i = first; i < count; i++) add(start + i, i * length, live ? length : Math.min(length, duration * scale - i * length));
    }
  } else if (lists.length) {
    Object.assign(track, parseSegmentList(lists, url, timing, live, range));
  } else if (addressing === "SegmentBase") {
    const bases = nodes.map((node) => xmlChild(node, "SegmentBase")).filter(Boolean);
    const options = Object.assign({}, ...bases.map((node) => node.attrs));
    const init = bases.map((node) => xmlChild(node, "Initialization")).filter(Boolean).at(-1);
    if (!options.indexRange) throw new Error("DASH SegmentBase requires indexRange");
    const scale = Number(options.timescale || 1), offset = Number(options.presentationTimeOffset || 0);
    if (!(scale > 0) || !Number.isFinite(scale) || !Number.isFinite(offset)) throw new Error("Invalid DASH SegmentBase timing");
    track.segmentBase = { url, indexRange: range(options.indexRange), presentationOffset: offset / scale, live };
    if (init) track.initSegments.push({ url: new URL(init.attrs.sourceURL || "", url).href, byteRange: range(init.attrs.range) });
    else if (track.segmentBase.indexRange.offset > 0) track.initSegments.push({ url, byteRange: { offset: 0, length: track.segmentBase.indexRange.offset } });
    else throw new Error("DASH SegmentBase initialization range is required");
  }
  else track.segments.push({ url, duration });
  if (!track.segments.length && !track.segmentBase && !live) throw new Error("No DASH segments");
  track.totalDuration = track.segments.reduce((sum, segment) => sum + segment.duration, 0) || duration;
  return track;
}
function range(value) {
  if (!value) return undefined;
  const match = value.match(/^(\d+)-(\d+)$/);
  if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) < Number(match[1])) throw new Error("Invalid DASH byte range");
  return { offset: Number(match[1]), length: Number(match[2]) - Number(match[1]) + 1 };
}
export function parseMpd(text, baseUrl, { now = Date.now() } = {}) {
  const mpd = parseXmlTree(text);
  if (/ContentProtection/.test(text)) throw new Error("Encrypted/DRM DASH is not supported");
  const dynamic = mpd.attrs.type === "dynamic";
  const availability = Date.parse(mpd.attrs.availabilityStartTime);
  if (dynamic && !Number.isFinite(availability)) throw new Error("Dynamic DASH requires availabilityStartTime");
  const end = dynamic ? (now - availability) / 1000 : 0;
  const live = dynamic ? { end, start: Math.max(0, end - (parseIsoDuration(mpd.attrs.timeShiftBufferDepth) || 60)) } : null;
  const periods = xmlChildren(mpd, "Period");
  if (!periods.length) throw new Error("DASH has no Period");
  const timings = resolvePeriodTiming(periods, parseIsoDuration(mpd.attrs.mediaPresentationDuration), end);
  const tracks = periods.flatMap((period, index) => xmlChildren(period, "AdaptationSet").flatMap((set) => xmlChildren(set, "Representation").map((rep) => buildTrack([mpd, period, set, rep], timings[index].duration, baseUrl, timings[index], live))));
  tracks.dynamic = dynamic;
  tracks.updateSeconds = Math.max(0.25, Math.min(30, parseIsoDuration(mpd.attrs.minimumUpdatePeriod) || 2));
  return tracks;
}
