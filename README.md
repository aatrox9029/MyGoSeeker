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

## Download Modes

- `Network`: Direct source fetch, source recovery, browser/native direct download, or HLS segment/remux workflows.
- `Record`: Playback-based capture for cases where source-grade network retrieval is unavailable.

## Notes

- Use this tool only for content you have the right to save.
- Some DRM-protected or encrypted streams are still unsupported.

## Install

Use `dist/MyGoSeeker-1.2.2-Extension.zip`, or run the newest `MyGoSeeker-1.2.2-Setup*.exe` in `dist` to extract it. In Chrome/Edge, open the extensions page, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. Reload the extension and refresh video pages after upgrading. Requires Chromium 116 or later.

The EXE is an **extension extraction assistant**. It does not install or update a native messaging downloader. This repository does not contain that downloader's source; the extension uses its own fallback when the native host is unavailable. ZIP/EXE checksums are in `dist/SHA256.json`.

## Development and verification

```powershell
npm.cmd ci
python scripts/sync-ffmpeg.py
npm.cmd run check
npm.cmd test
npx.cmd playwright install chromium
node tests/browser-smoke.mjs
python -m pip install -r requirements-build.txt
python scripts/build-release.py
```

The browser smoke test uses a temporary profile and synthetic local media; requires system `ffmpeg` and `ffprobe`. It checks direct downloads, HLS redirects, split audio, fMP4 byte ranges, a simulated HTTP 503 retry, browser completion, and the exported MP4's audio/video streams and duration. Development dependencies do not enter the packaged extension.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency provenance.

## Limits and troubleshooting

These fixes address reproducible failures; no measured success percentage across real websites is claimed. DRM/encrypted streams, incomplete live playlists, expired login/signature URLs, server restrictions, and browser memory limits can still prevent source downloads. For a live/blob player, select Record where available and keep playback running. Recording contains the portion played during capture and may lack audio when the page does not supply a capture audio track.

HLS remux buffers resources in memory and IndexedDB and has a two-minute FFmpeg execution timeout. Very large jobs may exceed browser memory/storage or service-worker lifetime limits. Use an available native helper for those cases.

Failed downloads expose **Export Record**, including attempts, fetch statuses/retries/ranges, remux diagnostics and output validation. Reports may contain signed source URLs; review their contents before sharing.

## Sharing edition

This package contains source code, tests, dependency declarations, and newly built ZIP/EXE releases. Browser profiles, saved download records, logs, build caches, previous releases, and development review reports are excluded. Account-specific extension identifiers and the original account's release link are removed; the setup-page button is disabled. Load this copy as a separate extension. The EXE extracts the extension and does not install a native helper.
