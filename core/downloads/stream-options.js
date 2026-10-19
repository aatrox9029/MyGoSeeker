export function normalizeStreamOptions(input = {}) {
  const liveSeconds = Number(input.liveSeconds || 0);
  if (!Number.isFinite(liveSeconds) || liveSeconds < 0 || liveSeconds > 3600) throw new Error("Live saving duration must be 0–3600 seconds");
  return { audioLanguage: String(input.audioLanguage || "").slice(0, 80), audioOnly: Boolean(input.audioOnly), liveSeconds };
}
