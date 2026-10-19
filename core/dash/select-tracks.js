export function selectDashTracks(tracks, options = {}) {
  const groups = new Map();
  for (const track of tracks) {
    if (!groups.has(track.periodId)) groups.set(track.periodId, []);
    groups.get(track.periodId).push(track);
  }
  return [...groups.values()].map((group) => {
    const videos = group.filter((t) => t.kind === "video").sort((a, b) => b.height - a.height || b.bandwidth - a.bandwidth);
    const audios = group.filter((t) => t.kind === "audio").sort((a, b) => b.bandwidth - a.bandwidth);
    const audio = options.audioLanguage ? audios.find((t) => t.language === options.audioLanguage || t.id === options.audioLanguage) : audios[0];
    if (options.audioLanguage && !audio) throw new Error("Selected audio language is unavailable in DASH Period; rescan");
    const video = options.audioOnly ? audio : videos[0] || audio;
    if (!video) throw new Error("No playable DASH representation");
    return { video, audio: !options.audioOnly && audio !== video ? audio : null };
  });
}
