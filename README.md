# MyGoSeeker
Detect and download accessible video sources from Chromium pages.

MyGoSeeker is a Chromium extension focused on detecting videos on the current page, separating them into clear download cards, and giving you practical download choices without forcing premium plans or hidden limits.

## Highlights

- Download videos without requiring a membership or paid unlock.
- Keep each detected video in its own card, even when multiple videos live on the same page.
- Choose the download style per video: `Network` for source/segment-based acquisition, or `Record` when capture is the only workable path.
- Automatically switch to another `Network` path when the current network method fails.
- Export debug records for failed downloads.
- Supports direct video URLs, blob-backed playback, and HLS playlists.
- Select available quality/source variants, including HLS variants with separate audio.
- Track downloading and completed tasks across page navigation and closed tabs.
- Remember downloaded videos and show downloaded badges; hide unwanted cards and restore them with Reset Hidden.
- Configure detection types and choose English, Traditional Chinese, Simplified Chinese, or Japanese.

## Download Modes

- `Network`: Direct source fetch, source recovery, browser/native direct download, or HLS segment/remux workflows.
- `Record`: Playback-based capture for cases where source-grade network retrieval is unavailable.

## Notes

- Use this tool only for content you have the right to save.
- Some DRM-protected or encrypted streams are still unsupported.

## Download status across pages

Downloading and completed cards appear in their respective tabs from any page, even when **Keep results from closed tabs** is off. Navigating from A to B, scanning another tab, or closing the original tab preserves these tasks. Available videos continue to follow the current tab unless the old-page setting is enabled. Hide and Clear Cache still let you remove results explicitly.

## Reliability features

- Native availability requires a READY handshake. Failed native jobs use the extension fallback.
- HLS quality choices retain separate audio tracks, including playlists reached through redirects.
- Segment downloads use four workers, credentials, a 30-second timeout, and up to three attempts for transient errors. Byte ranges and changing initialization segments are supported.
- The FFmpeg core now matches the 0.12 wrapper. Remux jobs run serially; binary inputs use IndexedDB instead of Chrome JSON messages. FFmpeg failures include recent diagnostic output.
- Finalized MP4 files use the browser Downloads API and show completion after the browser confirms it. Saving HLS no longer requires the original tab.
- Alternate sources of the same quality are retained. Duplicate starts and clearing cache during downloads are prevented. Cancelling a browser download stops automatic fallback.
- Blob metadata checks and stalled recordings have timeouts. Recording preserves playback settings and reports unavailable audio.

## Install

<<<<<<< Updated upstream
Use `dist/MyGoSeeker-1.0.2-Extension.zip`, or run the newest `MyGoSeeker-1.0.2-Setup*.exe` in `dist` to extract it. In Chrome/Edge, open the extensions page, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. Reload the extension and refresh video pages after upgrading. Requires Chromium 116 or later.
=======
Download available assets from [GitHub Releases](https://github.com/aatrox9029/MyGoSeeker/releases), or use a local build: `dist/MyGoSeeker-1.0.2-Extension.zip` or the newest `MyGoSeeker-1.0.2-Setup*.exe` in `dist`. The EXE extracts the extension. In Chrome/Edge, open `chrome://extensions` / `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. Reload the extension and refresh video pages after upgrading. Requires Chromium 116 or later.
>>>>>>> Stashed changes

The EXE is an **extension extraction assistant**. It does not install or update a native messaging downloader. This repository does not contain that downloader's source; the extension uses its own fallback when the native host is unavailable. ZIP/EXE checksums are in `dist/SHA256.json`.

## Usage

1. Open the video page in Chrome or Edge and start playback so the page loads its media sources.
2. Open MyGoSeeker from the browser extensions menu. Find the video card in **Available**; use **Rescan** if it has not appeared.
3. Choose a quality/source in **Variant**. Prefer **Network** for direct sources or HLS. Blob players also offer **Record** for playback capture.
4. Click **Download**. Follow progress in **Downloading** and results in **Completed**; files are saved through the browser's download system. Downloading and completed tasks remain visible across navigation or closing the source tab. Keep the source page open and playback running for Record and page-dependent blob acquisition.
5. Use **Download Again** for another copy, **Retry** after a failure, or **Export Record** to inspect source URLs and download diagnostics. **Hide** removes unwanted cards; **Reset Hidden** restores hidden results.

Record captures the portion played during recording; it does not guarantee a full original-quality download. Network tries other available network paths after a failure. Cancelling a browser download stops automatic fallback.

## Settings

Open **Settings**, adjust the following options, then click **Save Settings**:

| Setting | Behavior |
| --- | --- |
| Language | English, Traditional Chinese, Simplified Chinese, or Japanese for the popup and settings. Some diagnostic text may remain in English. |
| Detection Types | Enable or disable detection for `mp4`, `webm`, `m3u8`, `blob`, `mov`, `m4v`, `mkv`, `avi`, `flv`, and `mpeg`. Detection does not guarantee a source is downloadable. |
| Download history | Record completed videos and show downloaded badges. |
| Keep results from closed tabs | Retain old-page detection results. Downloading and completed tasks are retained even with this option off. |
| Clear cache | Clear cached results and runtime data; optionally keep user settings. Clearing is blocked while downloads are active. |

The **Download setup.exe** banner links to GitHub Releases when a native host is unavailable. This project's EXE only extracts the extension; it will not make the native host available. Browser-based fallback remains available.

## Development and verification

```powershell
npm.cmd ci
python scripts/sync-ffmpeg.py
npm.cmd run check
npm.cmd test
python -m unittest discover -s tests -p "test_*.py"
npx.cmd playwright install chromium
node tests/browser-smoke.mjs
python -m pip install -r requirements-build.txt
python scripts/build-release.py
```

The browser smoke test uses a temporary profile and synthetic local media; requires system `ffmpeg` and `ffprobe`. It checks direct downloads, HLS redirects, split audio, fMP4 byte ranges, a simulated HTTP 503 retry, browser completion, and the exported MP4's audio/video streams and duration. Development dependencies do not enter the packaged extension.

See [REVIEW.md](REVIEW.md) for the review checklist and validation evidence, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency provenance.

## Limits and troubleshooting

These fixes address reproducible failures; no measured success percentage across real websites is claimed. DRM/encrypted streams, incomplete live playlists, expired login/signature URLs, server restrictions, and browser memory limits can still prevent source downloads. For a live/blob player, select Record where available and keep playback running. Recording contains the portion played during capture and may lack audio when the page does not supply a capture audio track.

HLS remux buffers resources in memory and IndexedDB and has a two-minute FFmpeg execution timeout. Very large jobs may exceed browser memory/storage or service-worker lifetime limits. Use an available native helper for those cases.

Failed downloads expose **Export Record**, including attempts, fetch statuses/retries/ranges, remux diagnostics and output validation. Reports may contain signed source URLs; review their contents before sharing.
