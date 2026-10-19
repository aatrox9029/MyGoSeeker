export function validateOutputTracks(lines, { video = true, audio = false } = {}) {
  const parts = lines.join("\n").split(/Output #0/);
  const output = parts.length > 1 ? parts.at(-1) : "";
  const hasVideo = /Stream #0:\d+.*Video:/i.test(output);
  const hasAudio = /Stream #0:\d+.*Audio:/i.test(output);
  return { hasVideo, hasAudio, tracksValid: (!video || hasVideo) && (!audio || hasAudio) };
}
