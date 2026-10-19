import { readSegmentResource } from "../hls/segment-checkpoint.js";
import { writeConcatenatedTrack } from "./write-concatenated-track.js";
// Local fMP4 playlists avoid allocating another complete track in JavaScript.
export async function writeDashTrack(ffmpeg, track, checkCancelled) {
  if (!track.fragmentedPlaylists) return writeConcatenatedTrack(ffmpeg, track, checkCancelled);
  for (const part of track.fragmentedPlaylists) {
    const init = part.resources.find((r) => r.kind === "init");
    const segments = part.resources.filter((r) => r.kind === "segment");
    const lines = ["#EXTM3U", "#EXT-X-VERSION:7", `#EXT-X-TARGETDURATION:${Math.max(1, Math.ceil(Math.max(...segments.map((r) => r.duration || 1))))}`,
      `#EXT-X-MAP:URI="${init.fileName}"`, ...segments.flatMap((r) => [`#EXTINF:${r.duration || 1},`, r.fileName]), "#EXT-X-ENDLIST"];
    await ffmpeg.writeFile(part.playlistFileName, new TextEncoder().encode(lines.join("\n")));
    for (const resource of part.resources) { checkCancelled(); await ffmpeg.writeFile(resource.fileName, new Uint8Array(await readSegmentResource(resource))); }
  }
  if (track.concatFileName) await ffmpeg.writeFile(track.concatFileName, new TextEncoder().encode(track.fragmentedPlaylists.map((part) => `file '${part.playlistFileName}'`).join("\n")));
}
