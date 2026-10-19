export function chooseOutputFormat(codecs = "", audioOnly = false) {
  const value = codecs.toLowerCase();
  if (/theora/.test(value)) throw new Error("Theora is incompatible with MP4/WebM output; select another codec.");
  if (/vorbis|vp8|vp9|vp09|opus/.test(value)) {
    if (/(avc|hvc|hev|mp4a|aac|ac-3)/.test(value)) throw new Error("Unsupported mixed codecs for WebM; select another stream.");
    return { extension: "webm", container: "webm", mimeType: audioOnly ? "audio/webm" : "video/webm" };
  }
  if (value && !value.split(",").every((codec) => /^(avc[13]|hvc1|hev1|av01|mp4a|aac|ac-3|ec-3|alac|flac)/.test(codec.trim()))) throw new Error(`Unsupported output codec: ${value}`);
  return { extension: audioOnly ? "m4a" : "mp4", container: "mp4", mimeType: audioOnly ? "audio/mp4" : "video/mp4" };
}
