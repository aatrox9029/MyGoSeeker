export function buildInputArguments(track) {
  const args = ["-protocol_whitelist", "file,pipe,data"];
  if (track.concatFileName) return [...args, "-f", "concat", "-safe", "0", "-i", track.concatFileName];
  // Only rewritten playlists in the WASM filesystem use this override.
  // CDN segment suffixes (for example .jpg) do not identify their media format.
  if (!track.inputFileName) args.push("-allowed_extensions", "ALL");
  args.push("-i", track.inputFileName || track.playlistFileName);
  return args;
}
