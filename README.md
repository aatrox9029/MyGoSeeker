# MyGoSeeker

[繁體中文](README.md) | [English](README.en.md)

MyGoSeeker is a Chrome / Edge / Brave extension that detects videos on web pages and offers download options.

## Features

- Detect direct video URLs, HLS, static/dynamic DASH and some blob players, including iframe and open Shadow DOM players.
- Choose available quality options and use Network to download or Record to capture playback.
- Track download progress and completed downloads; export debug records when downloads fail.
- Supports Traditional Chinese, Simplified Chinese, English, and Japanese interfaces.

## Installation

Version 1.0.2 retains the original download cards and adds a full download manager. Audio/video merge automatically into codec-aware MP4 or WebM output. Unencrypted DASH supports continuous multiple Periods, templates, timelines, lists and SegmentBase/sidx byte ranges. Dynamic DASH defaults to a 30-second capture; the manager accepts 1–3600 seconds. Standard AES-128 HLS with identity HTTP(S) keys supports automatic decryption and key rotation. DRM/SAMPLE-AES remain unsupported. See [the improvement checklist](IMPROVEMENTS.md) for support boundaries and verification.

The manager shows tasks across pages, batch pause/resume/cancel/retry, queued-task priority, media previews, temporary storage usage, per-task/expired cleanup, and searchable/filterable history with JSON export and individual deletion. Deleting history never removes video files. Settings allow 1–4 simultaneous downloads; the shared memory budget still limits streams. Segment concurrency adapts to request duration and retries use jittered backoff.

Website origin controls independently govern detection, cookies and Native helper use. Cookie controls apply to extension requests and native jobs; credential-free direct downloads use bounded fetch and support MP4/WebM up to 16 MiB. Browser permissions remain unchanged. Native health checks show connection, version and executable FFmpeg/ffprobe status without installing or enabling the host. Build identifiers appear in Settings, the manager and diagnostics; version remains 1.0.2.

Authentication failures offer a source reopen/rescan action. Sign in and replay the source, then use the newly discovered URL. Changed URLs, ranges, manifests or encryption descriptors invalidate checkpoints; saved data from distinct sources is never mixed. Interrupted remuxing restarts from saved segments. fMP4 DASH uses local playlists to avoid another full-track JavaScript buffer. Remux output checks size, container, duration and expected video/audio tracks; browser direct downloads check browser metadata, and credential-free direct downloads additionally validate readable media metadata.

For development, install dependencies with `npm ci`, install Chromium with `npx playwright install chromium`, and provide FFmpeg/ffprobe and Python. Run `npm run verify` for all checks, including three real-browser suites. Install `requirements-build.txt` and run `python scripts/build-release.py` to build the ZIP and Windows EXE.

To test Brave in PowerShell, set `$env:MGS_BROWSER_EXECUTABLE = 'C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe'` (adjust for your installation), then run `npm run verify`. Browser suites use separate temporary profiles.

Requires Chrome / Edge / Brave (Chromium 116 or later).

1. Download the extension ZIP or Setup EXE from [GitHub Releases](https://github.com/aatrox9029/MyGoSeeker/releases).
2. Unzip the ZIP, or run the EXE to extract the extension into a folder of your choice.
3. Open `chrome://extensions`, `edge://extensions` or `brave://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open a video page and start playback, then open MyGoSeeker to select a video to download.

The EXE only helps extract the extension. After updating, reload the extension and refresh video pages.

An **optional Windows Native helper** is available as a separate `MyGoSeeker-1.0.2-NativeHelper.exe`. It is disabled by default. Run it, paste your extension ID from the Settings page, then enable **Native helper** in Settings and save. It registers the host for your user in Chrome, Edge and Brave, downloads direct HTTP(S) media and remuxes HLS locally, and falls back to the built-in downloader on failure. HLS requires separately installed FFmpeg and ffprobe; neither is bundled. The original Setup EXE still only extracts the extension. See [Native helper installation, controls and troubleshooting](NATIVE_HELPER.md). The version stays at **1.0.2** until the user explicitly specifies the next version number.

## HLS remux fails on `.jpg` segments

`Filename extension ... .jpg ... blocked for security reasons` means FFmpeg rejected a segment's filename suffix; the content may still be media. The built-in downloader now places `-allowed_extensions ALL` before `-i` for each local HLS input while retaining the local protocol restriction.

Extract the latest 1.0.2 ZIP or Setup EXE containing this fix, reload the extension at `chrome://extensions`, `edge://extensions` or `brave://extensions`, then refresh the video page and retry. The unchanged version number does not confirm that the latest files are loaded. Setup only extracts files; you still need to reload the extension in your browser.

If it still fails, export the task's debug record. Check that `Local remux arguments` includes `-allowed_extensions ALL` before each `.m3u8` input, then inspect subsequent FFmpeg messages. This option addresses suffix restrictions; error pages or actual images still require a valid media source.

## AES-128 HLS downloads

The blanket `Encrypted m3u8 is not supported` rejection has been removed. Standard AES-128 HLS uses the playlist's accessible 16-byte key and explicit IV or media sequence IV to decrypt segments before remuxing, without extra settings. Key rotation and encrypted initialization sections with explicit IVs are supported.

For key HTTP 401/403 errors, sign in, refresh the source page and rescan. Diagnostics include key request stages, segment indexes and decryption outcomes without recording key bytes. Unsupported encryption/DRM has separate guidance; generic remux failures no longer claim all encrypted sources are unsupported. Implementation follows [HLS RFC 8216](https://www.rfc-editor.org/rfc/rfc8216.html).

Record captures only the content played during recording. DRM/SAMPLE-AES and other unsupported encryption cannot be downloaded.

See [THIRD_PARTY_NOTICES.md](https://github.com/aatrox9029/MyGoSeeker/blob/main/THIRD_PARTY_NOTICES.md) for dependency provenance.  
