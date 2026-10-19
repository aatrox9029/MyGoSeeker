const TEXT = {
  auth: ["重新開啟來源頁面並登入，再重新掃描；授權網址可能已過期。", "Reopen the source, sign in and rescan; the authorized URL may have expired."],
  network: ["檢查網路，稍後重試或選擇另一來源；暫停的串流可繼續。", "Check your connection, retry later or select another source; paused streams can resume."],
  native: ["在設定中檢查 Native helper 連線與 FFmpeg／ffprobe，必要時重新安裝。", "Check Native helper and FFmpeg/ffprobe in Settings; reinstall the helper if needed."],
  validation: ["輸出驗證失敗；請改用其他畫質或來源，並匯出除錯紀錄。", "Output validation failed; select another quality or source and export the debug record."],
  codec: ["改選其他編碼／畫質後重試。", "Select another codec or quality and retry."],
  encryption: ["一般 AES-128 HLS 可下載；請重新整理來源並確認金鑰可存取，再重試。", "Standard AES-128 HLS is supported; refresh the source, check key access and retry."],
  drm: ["此來源使用尚未支援的加密或 DRM；請選擇可直接下載的來源。", "This source uses unsupported encryption or DRM; select a directly downloadable source."],
  storage: ["釋放磁碟空間、清理未使用的暫存或降低畫質後重試。", "Free disk space, clear inactive cache or select a smaller quality and retry."],
  source: ["重新播放來源並掃描，再選擇其他下載方式。", "Replay the source and rescan, then select another download method."]
};
export function classifyDownloadError(error) {
  const text = String(error?.message || error || "");
  if (/401|403|authorization|unauthor|forbidden|expired/i.test(text)) return "auth";
  if (/native (?:host|helper).*(?:unavailable|disconnect|failed|not installed|timed out)|handshake/i.test(text)) return "native";
  if (/validation|metadata|non-video|duration mismatch/i.test(text)) return "validation";
  if (/DRM|SAMPLE-AES|unsupported HLS encryption/i.test(text)) return "drm";
  if (/AES-128|decrypt|HLS key|encrypted/i.test(text)) return "encryption";
  if (/storage|quota|space|limit|capacity|too large|exceeds|FILE_NO_SPACE/i.test(text)) return "storage";
  if (/codec|ffmpeg|remux|encrypted|drm|container|metadata|unsupported|not supported/i.test(text)) return "codec";
  if (/network|fetch|HTTP|timeout|timed out|connection/i.test(text)) return "network";
  return "source";
}
export function downloadErrorGuidance(error, locale) { return TEXT[classifyDownloadError(error)][locale?.startsWith("zh") ? 0 : 1]; }
