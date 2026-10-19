<p align="center">
  <img src="icon.png" alt="MyGoSeeker icon" width="300" height="300">
</p>

# MyGoSeeker

English | [繁體中文](README.zh_TW.md)

A Chrome, Edge, and Brave extension for detecting and downloading videos from web pages.

## Features

- Detect direct video links, HLS (m3u8), DASH, and some blob-based players.
- Choose available video quality, download videos, or record playback.
- Manage downloads across tabs with progress tracking, batch controls, and download history.
- Export debug records to help troubleshoot failed downloads.
- Available in English, Traditional Chinese, Simplified Chinese, and Japanese.

## Download & Install


1. Download the **Extension ZIP** or Windows **Setup EXE** from [GitHub Releases](https://github.com/aatrox9029/MyGoSeeker/releases).
2. Extract the ZIP, or run the Setup EXE to extract the extension into a folder.
3. Open `chrome://extensions`, `edge://extensions`, or `brave://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Play a video on a web page, then open MyGoSeeker to choose a video and start downloading.

The Setup EXE extracts the extension; loading it in the browser is still required. After an update, reload the extension and refresh the video page.

An optional Windows **Native Helper** is also available in Releases for local downloads and HLS processing. It is disabled by default; HLS processing requires FFmpeg and ffprobe installed separately.

Recording captures the content played during recording. DRM-protected videos and SAMPLE-AES encryption are unsupported.
