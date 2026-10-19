export function trackPlaylist(track) {
  if (track.initSegments.length > 1) throw new Error("Multiple DASH initialization resources unsupported");
  const text = ["#EXTM3U", "#EXT-X-VERSION:7", `#EXT-X-TARGETDURATION:${Math.max(1, Math.ceil(Math.max(...track.segments.map((item) => item.duration))))}`,
    ...(track.initSegments[0] ? [`#EXT-X-MAP:URI="${track.initSegments[0].url}"`] : []),
    ...track.segments.flatMap((item) => [`#EXTINF:${item.duration || 1},`, item.url]), "#EXT-X-ENDLIST"].join("\n");
  return { text, info: track };
}
