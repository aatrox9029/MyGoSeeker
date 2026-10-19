import { readSegmentResource } from "../hls/segment-checkpoint.js";
import { MAX_REMUX_BYTES } from "../hls/segment-checkpoint.js";
export async function writeConcatenatedTrack(ffmpeg, track, checkCancelled) {
  if (track.concatFileName) {
    for (const part of track.parts) await writeConcatenatedTrack(ffmpeg, part, checkCancelled);
    await ffmpeg.writeFile(track.concatFileName, new TextEncoder().encode(track.parts.map((part) => `file '${part.inputFileName}'`).join("\n")));
    return;
  }
  const size = track.resources.reduce((total, item) => total + (item.byteLength || item.bytes?.byteLength || 0), 0);
  if (!(size > 0) || size > MAX_REMUX_BYTES) throw new Error("DASH track exceeds safe remux buffer limit");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const resource of track.resources) {
    checkCancelled();
    const part = new Uint8Array(await readSegmentResource(resource));
    bytes.set(part, offset); offset += part.byteLength;
  }
  await ffmpeg.writeFile(track.inputFileName, bytes);
}
