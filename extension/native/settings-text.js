const texts = {
  en: ["Optional Native helper", "Enable installed Native helper", "Install NativeHelper EXE separately. Direct HTTP and HLS run locally; failures use the built-in downloader. HLS requires FFmpeg and ffprobe. Setup EXE only extracts the extension.", "Extension ID for NativeHelper installer"],
  "zh-Hant": ["選用 Native helper", "啟用已安裝的 Native helper", "請另行安裝 NativeHelper EXE。直連與 HLS 可在本機下載；失敗時使用內建下載器。HLS 需要 FFmpeg 與 ffprobe。Setup EXE 只解壓擴充功能。", "NativeHelper 安裝時使用的擴充功能 ID"],
  "zh-Hans": ["可选 Native helper", "启用已安装的 Native helper", "请另外安装 NativeHelper EXE。直连与 HLS 可在本机下载；失败时使用内置下载器。HLS 需要 FFmpeg 和 ffprobe。Setup EXE 只解压扩展程序。", "NativeHelper 安装时使用的扩展程序 ID"],
  ja: ["任意の Native helper", "導入済み Native helper を有効にする", "NativeHelper EXE は別途導入します。HTTP と HLS をローカルで保存し、失敗時は内蔵機能を使います。HLS には FFmpeg と ffprobe が必要です。Setup EXE は拡張機能のみ展開します。", "NativeHelper 導入時の拡張機能 ID"]
};
export function nativeHelperText(locale) {
  return Object.fromEntries(["nativeHelperHeading", "nativeHelperLabel", "nativeHelperHelp", "extensionIdLabel"]
    .map((id, index) => [id, (texts[locale] || texts.en)[index]]));
}
