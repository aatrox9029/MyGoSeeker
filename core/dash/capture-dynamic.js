import { parseMpd } from "./parse-mpd.js";
import { selectDashTracks } from "./select-tracks.js";
import { fetchWithRetry } from "../network/fetch-retry.js";
import { abortableDelay, throwIfAborted } from "../tasks/operation-control.js";
import { resolveSegmentBase } from "./resolve-segment-base.js";

export async function captureDynamicDash(url, firstTracks, seconds, options, consume) {
  if (!(seconds >= 1 && seconds <= 3600)) throw new Error("Dynamic DASH requires a saving duration of 1–3600 seconds");
  const clock = options.now || Date.now, wait = options.wait || abortableDelay;
  const deadline = clock() + seconds * 1000, seen = new Map();
  let tracks = firstTracks, captured = 0;
  while (clock() < deadline) {
    throwIfAborted(options.signal);
    const available = [];
    for (const track of tracks) available.push(await resolveSegmentBase(track, options));
    const selections = selectDashTracks(available.filter((track) => track.segments.length), options);
    for (const pair of selections) {
      const fresh = {};
      for (const kind of ["video", "audio"]) {
        const track = pair[kind]; if (!track) continue;
        const key = `${track.periodId}:${kind}:${track.id}`;
        const previous = seen.get(key);
        // Start at the latest complete segment, then collect every new segment.
        const segments = previous === undefined ? track.segments.slice(-1) : track.segments.filter((item) => item.startTime >= previous - 0.001);
        if (!segments.length) continue;
        if (previous !== undefined && Math.abs(segments[0].startTime - previous) > 0.05) throw new Error("Dynamic DASH window skipped segments; rescan and retry");
        fresh[kind] = { ...track, segments, totalDuration: segments.reduce((sum, item) => sum + item.duration, 0) };
        seen.set(key, segments.at(-1).startTime + segments.at(-1).duration);
      }
      if (fresh.video || fresh.audio) {
        await consume(fresh);
        captured += fresh.video?.totalDuration || 0;
      }
      if (captured >= seconds) break;
    }
    if (captured >= seconds || !tracks.dynamic) break;
    await wait(Math.min(tracks.updateSeconds * 1000, Math.max(1, deadline - clock())), options.signal);
    tracks = parseMpd(await fetchWithRetry(url, "text", { ...options, maxBytes: 2 * 1024 * 1024, stage: "dash-update" }), url, { now: clock() });
    options.logger?.("info", "dash-update", "Updated dynamic MPD", { captured, seconds, tracks: tracks.length });
  }
  if (!captured) throw new Error("No complete dynamic DASH segments captured");
  return captured;
}
