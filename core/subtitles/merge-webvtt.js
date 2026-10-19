function seconds(value) {
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) throw new Error("Invalid WebVTT timestamp");
  return parts.reduce((total, part) => total * 60 + part, 0);
}
function timestamp(value) {
  const ms = Math.max(0, Math.round(value * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
export function mergeWebVtt(chunks) {
  let origin, previousPts;
  const cues = new Map();
  for (const chunk of chunks) {
    if (!/^\uFEFF?WEBVTT/.test(chunk)) throw new Error("Unsupported subtitle format; WebVTT required");
    const map = chunk.match(/X-TIMESTAMP-MAP\s*=\s*([^\n]+)/);
    let offset = 0;
    if (map) {
      const local = map[1].match(/LOCAL:([\d:.]+)/), pts = map[1].match(/MPEGTS:(\d+)/);
      if (!local || !pts) throw new Error("Invalid subtitle timestamp map");
      let ticks = Number(pts[1]);
      if (previousPts !== undefined) while (ticks < previousPts - 2 ** 32) ticks += 2 ** 33;
      previousPts = ticks; origin ??= ticks / 90000;
      offset = ticks / 90000 - origin - seconds(local[1]);
    }
    const body = chunk.replace(/^\uFEFF?WEBVTT[^\n]*\n/, "").replace(/^X-TIMESTAMP-MAP[^\n]*\n?/gm, "");
    for (const block of body.trim().split(/\r?\n\s*\r?\n/)) {
      const timing = block.match(/([\d:.]+)\s+-->\s+([\d:.]+)([^\n]*)(\r?\n[\s\S]*)?/);
      if (!timing) { if (/^(STYLE|REGION)/.test(block)) throw new Error("Styled segmented subtitles require a standalone WebVTT track"); continue; }
      const start = seconds(timing[1]) + offset, end = seconds(timing[2]) + offset;
      const cue = `${timestamp(start)} --> ${timestamp(end)}${timing[3]}${timing[4] || ""}`;
      cues.set(cue, { start, cue });
    }
  }
  return `WEBVTT\n\n${[...cues.values()].sort((a, b) => a.start - b.start).map((item) => item.cue).join("\n\n")}\n`;
}
