# MyGoSeeker

[繁體中文](README.md) | [English](README.en.md)

MyGoSeeker 是 Chrome / Edge 擴充功能，可偵測網頁中的影片並提供下載選項。

## 功能介紹

- 偵測影片來源，支援直接影片連結、HLS 與部分 blob 播放器。
- 選擇可用畫質，透過 Network 下載或 Record 錄製播放內容。
- 查看下載進度與完成紀錄，下載失敗時可匯出除錯紀錄。
- 支援繁體中文、簡體中文、英文與日文介面。

## 如何安裝

需使用 Chrome / Edge（Chromium 116 或更新版本）。

1. 從 [GitHub Releases](https://github.com/aatrox9029/MyGoSeeker/releases) 下載擴充功能 ZIP 或 Setup EXE。
2. 解壓縮 ZIP，或執行 EXE 將擴充功能解壓縮到指定資料夾。
3. 開啟 `chrome://extensions` 或 `edge://extensions`，啟用「開發人員模式」。
4. 點選「載入未封裝項目」，選取含有 `manifest.json` 的資料夾。
5. 開啟影片網頁並播放影片，再開啟 MyGoSeeker 選擇影片下載。

EXE 僅協助解壓縮擴充功能；更新後請重新載入擴充功能並重新整理影片頁面。

Record 僅錄製播放期間的內容；部分 DRM 或加密影片不支援下載。

See [THIRD_PARTY_NOTICES.md](https://github.com/aatrox9029/MyGoSeeker/blob/main/THIRD_PARTY_NOTICES.md) for dependency provenance.  
