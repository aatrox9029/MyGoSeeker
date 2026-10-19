# MyGoSeeker

[繁體中文](README.md) | [English](README.en.md)

MyGoSeeker 是 Chrome / Edge / Brave 擴充功能，可偵測網頁中的影片並提供下載選項。

## 功能介紹

- 偵測影片來源，支援直接影片連結、HLS、靜態／動態 DASH 與部分 blob 播放器，涵蓋 iframe 及開放的 Shadow DOM。
- 選擇可用畫質，透過 Network 下載或 Record 錄製播放內容。
- 查看下載進度與完成紀錄，下載失敗時可匯出除錯紀錄。
- 支援繁體中文、簡體中文、英文與日文介面。

## P0 改善

- HLS 分段會立即保存，暫停或中斷後可按「繼續」沿用已保存的分段；來源清單變動時會重新下載。
- 支援下載與錄製的暫停、繼續、取消；HLS 轉封裝暫停後會從轉封裝階段重做，不必重抓分段。
- 背景重啟會核對瀏覽器任務。錄製頁面關閉或重載後無法接續錄製，請重新播放並重試。
- 除錯匯出會遮罩已知驗證參數、Cookie 與驗證標頭；下載歷史保留影片識別參數。
- 舊版下載歷史缺少識別參數，升級後會重建已下載標記；舊資料保留在本機備份，完成的下載卡片不受影響。
- 瀏覽器 HLS 轉封裝目前限制單一資源 16 MiB、單一任務音訊與影片合計 256 MiB；超過時會顯示錯誤，請選擇較小畫質。FFmpeg 仍需記憶體處理輸入，此限制不是實測記憶體用量保證。

完整進度請見 [改善清單](IMPROVEMENTS.md)。

## v1.0.2：P1／P2 改善

- 下載佇列限制同時任務及串流緩衝預算；進度合併保存、Popup 僅取得異動卡片，暫存定期回收並檢查容量與空間。
- 下載介面統一使用原本的影片卡片，保留畫質／下載方式、下載、暫停／繼續／取消及紀錄匯出；移除音軌、僅音訊、Live 秒數與字幕自選欄位。影音自動合併，依編碼輸出 MP4 或 WebM。
- 未加密 DASH 支援連續多 Period、SegmentTemplate／Timeline／List，以及 SegmentBase／sidx 位元組範圍。動態 DASH 預設擷取 30 秒，完整管理頁可指定 1–3600 秒。一般 HLS AES-128（identity、HTTP(S) 金鑰）支援自動解密，包含 IV、媒體序號及金鑰輪替。DRM／SAMPLE-AES 尚未支援。
- 搜尋、排序、勾選批次下載、速度／剩餘時間，以及設定頁的檔名規則 `{title}`、`{quality}`、`{date}`、`{id}`。
- 授權、網路、編碼及空間錯誤提供處理指引。完整支援範圍與驗證紀錄見改善清單。

## 完整下載管理與網站控制

Popup 的「下載管理」開啟完整頁面，顯示所有頁面的任務。可勾選批次暫停、繼續、取消、重試失敗項目；等待中的任務可提高優先順序。設定頁可調整同時下載數（1–4），串流仍受共用記憶體預算限制。分段並行數會隨請求耗時調整，重試使用隨機退避。

「媒體資訊」提供編碼、音軌／字幕語言、時長、Period 數與可取得的預估大小；預估大小不是保證。管理頁亦提供暫存用量、各任務分段用量、暫停任務的分段清理、過期清理，以及下載歷史搜尋、類型篩選、JSON 匯出和單筆刪除。清除歷史不會刪除影片檔案。

設定頁可按網站來源控制偵測、Cookie 傳送與 Native helper。Cookie 控制用於擴充功能請求及 Native helper；關閉 Cookie 的直連下載改用無憑證請求，支援最多 16 MiB 的 MP4／WebM。既有瀏覽器權限不會因此變更。Native helper 健康檢查會顯示主機連線、版本與 FFmpeg／ffprobe 是否可執行；檢查不會安裝或啟用主機。

401／403 的卡片提供重新開啟／掃描來源按鈕。登入並重新播放後，再使用最新來源下載；URL、範圍、清單或加密描述變動時會使檢查點失效，不會把新來源與舊分段混合。背景或合併中斷後可繼續已保存分段，合併階段會重新執行。建置時間與提交識別顯示在設定、管理頁與除錯報告，版本維持 1.0.2。

fMP4 DASH 使用本機分段清單合併，避免額外配置整條影片的 JavaScript 緩衝區。內建合併驗證非零大小、容器、可讀時長與預期音視訊軌；直連瀏覽器下載採瀏覽器大小／類型檢查，無憑證直連另驗證媒體 metadata。詳細支援邊界見 [改善清單](IMPROVEMENTS.md)。

開發驗證：`npm ci`、`npx playwright install chromium`，並安裝 FFmpeg／ffprobe 與 Python，再執行 `npm run verify`。建置 EXE：安裝 `requirements-build.txt` 後執行 `python scripts/build-release.py`。

測試 Brave 時，在 PowerShell 設定 `$env:MGS_BROWSER_EXECUTABLE = 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'`（依安裝位置調整），再執行 `npm run verify`。瀏覽器測試使用獨立暫存設定檔。

## 如何安裝

需使用 Chrome / Edge / Brave（Chromium 116 或更新版本）。

1. 從 [GitHub Releases](https://github.com/aatrox9029/MyGoSeeker/releases) 下載擴充功能 ZIP 或 Setup EXE。
2. 解壓縮 ZIP，或執行 EXE 將擴充功能解壓縮到指定資料夾。
3. 開啟 `chrome://extensions`、`edge://extensions` 或 `brave://extensions`，啟用「開發人員模式」。
4. 點選「載入未封裝項目」，選取含有 `manifest.json` 的資料夾。
5. 開啟影片網頁並播放影片，再開啟 MyGoSeeker 選擇影片下載。

EXE 僅協助解壓縮擴充功能；更新後請重新載入擴充功能並重新整理影片頁面。

本專案提供**選用 Windows Native helper**，獨立檔案為 `MyGoSeeker-1.0.2-NativeHelper.exe`，預設關閉。執行該 EXE，填入設定頁顯示的擴充功能 ID，再於設定勾選啟用 Native helper 並儲存。安裝程式只為目前使用者註冊 Chrome／Edge／Brave 主機；可在本機下載 HTTP(S) 直連影片與合併 HLS，失敗時回退內建下載器。HLS 需要另行安裝 FFmpeg 與 ffprobe，並未隨附。原本 Setup EXE 仍只解壓擴充功能。詳見 [Native helper 安裝、操作與排錯](NATIVE_HELPER.md)。

目前版本固定為 **v1.0.2**；只有使用者指定下一個版本號時才修改。

Record 僅錄製播放期間的內容；部分 DRM 或加密影片不支援下載。

## HLS `.jpg` 分片轉封裝失敗

若錯誤包含 `Filename extension ... .jpg ... blocked for security reasons`，表示 FFmpeg 因副檔名限制拒絕開啟片段；片段實際上可能是影音資料。內建下載器已對每個本機 HLS 輸入在 `-i` 前加入 `-allowed_extensions ALL`，並保留本機協定限制。

請使用包含此修正的最新 1.0.2 ZIP 或 Setup EXE，解壓後到 `chrome://extensions`、`edge://extensions` 或 `brave://extensions` 重新載入該擴充功能，再重新整理影片頁面並重試。版本號相同不代表已載入最新檔案；Setup EXE 只解壓檔案，仍需在瀏覽器重新載入。

若仍失敗，匯出該任務的除錯紀錄，確認 `Local remux arguments` 中每個 `.m3u8` 輸入前均有 `-allowed_extensions ALL`，並檢查後續 FFmpeg 訊息。此選項只處理副檔名限制；若片段內容是錯誤頁或真正的圖片，仍需取得有效的影音來源。

## HLS AES-128 加密下載

原本的 `Encrypted m3u8 is not supported` 一律拒絕判斷已移除。一般 AES-128 HLS 會使用來源清單提供的金鑰，在下載後解密片段，再轉封裝。金鑰需能透過目前登入狀態存取，內容須為 16 bytes；不需要額外選項。

若金鑰回傳 401／403，請先登入來源並重新整理影片頁面，再掃描下載。若解密失敗，除錯紀錄會顯示金鑰請求、片段索引、解密結果與錯誤原因，不記錄金鑰內容。DRM、SAMPLE-AES 或其他未支援的加密會顯示獨立提示，不再把所有轉封裝失敗都解釋成加密問題。實作依據 [HLS RFC 8216](https://www.rfc-editor.org/rfc/rfc8216.html)。

See [THIRD_PARTY_NOTICES.md](https://github.com/aatrox9029/MyGoSeeker/blob/main/THIRD_PARTY_NOTICES.md) for dependency provenance.  
