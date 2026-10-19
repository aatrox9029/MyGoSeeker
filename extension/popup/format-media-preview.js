export function formatMediaPreview(data, locale) {
  const zh = locale?.startsWith("zh"), lines = [];
  const field = (en, cn, value) => { if (value !== undefined && value !== "") lines.push(`${zh ? cn : en}: ${value}`); };
  field("Format", "格式", data.type?.toUpperCase());
  field("Codec", "編碼", data.codecs);
  field("Duration", "時長", data.duration ? `${data.duration.toFixed(2)} s` : undefined);
  field("Periods", "區段數", data.periods);
  field("Live", "直播", data.dynamic === undefined ? undefined : data.dynamic ? "✓" : "–");
  field("Estimated size", "預估大小", data.estimatedBytes ? `${(data.estimatedBytes / 1048576).toFixed(2)} MiB` : zh ? "未提供" : "Unavailable");
  for (const track of data.tracks || []) lines.push([track.kind || "", track.language || "", track.height ? `${track.height}p` : "", track.codecs || "", track.bandwidth ? `${Math.round(track.bandwidth / 1000)} kb/s` : ""].filter(Boolean).join(" · "));
  field("Audio languages", "音軌語言", (data.audioTracks || []).map((t) => t.language || t.name).join(", "));
  field("Subtitle languages", "字幕語言", (data.subtitleTracks || []).map((t) => t.language || t.name).join(", "));
  lines.push(zh ? "內建合併：每個分段最多 16 MiB，總計最多 256 MiB。Native helper 支援直連／HLS。DRM 尚未支援。" : data.limits);
  if (data.exceedsBrowserLimit) lines.push(zh ? "預估大小超過內建限制，請降低畫質。" : "Estimated size exceeds the browser limit; select a smaller quality.");
  return lines.filter(Boolean).join("\n");
}
