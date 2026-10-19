<p align="center">
  <img src="icon.png" alt="MyGoSeeker 圖示" width="300" height="300">
</p>

# MyGoSeeker

[English](README.md) | 繁體中文

適用於 Chrome、Edge 與 Brave 的擴充功能，可偵測並下載網頁中的影片。

## 功能

- 偵測影片直連、HLS（m3u8）、DASH 與部分 blob 播放器。
- 選擇可用畫質，下載影片或錄製播放內容。
- 跨分頁管理下載，查看進度、批次操作與下載歷史。
- 匯出除錯紀錄，協助排查下載失敗的原因。
- 提供英文、繁體中文、簡體中文與日文介面。

## 下載與安裝


1. 前往 [GitHub Releases](https://github.com/aatrox9029/MyGoSeeker/releases) 下載 **Extension ZIP** 或 Windows **Setup EXE**。
2. 解壓縮 ZIP，或執行 Setup EXE，將擴充功能解壓縮到資料夾。
3. 開啟 `chrome://extensions`、`edge://extensions` 或 `brave://extensions`，啟用「開發人員模式」。
4. 點選「載入未封裝項目」，選取包含 `manifest.json` 的資料夾。
5. 開啟影片網頁並播放，再開啟 MyGoSeeker 選擇影片下載。

Setup EXE 僅協助解壓縮，仍須在瀏覽器載入擴充功能。更新後請重新載入擴充功能，並重新整理影片頁面。

Releases 另提供選用的 Windows **Native Helper**，可在本機下載影片與處理 HLS，預設不啟用；處理 HLS 需另行安裝 FFmpeg 與 ffprobe。

錄製功能僅擷取錄製期間播放的內容，不支援 DRM 保護影片與 SAMPLE-AES 加密。
