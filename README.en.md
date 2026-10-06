# MyGoSeeker

[繁體中文](README.md) | [English](README.en.md)

MyGoSeeker is a Chrome / Edge extension that detects videos on web pages and offers download options.

## Features

- Detect video sources, including direct video URLs, HLS, and some blob players.
- Choose available quality options and use Network to download or Record to capture playback.
- Track download progress and completed downloads; export debug records when downloads fail.
- Supports Traditional Chinese, Simplified Chinese, English, and Japanese interfaces.

## Installation

Requires Chrome / Edge (Chromium 116 or later).

1. Download the extension ZIP or Setup EXE from [GitHub Releases](https://github.com/aatrox9029/MyGoSeeker/releases).
2. Unzip the ZIP, or run the EXE to extract the extension into a folder of your choice.
3. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open a video page and start playback, then open MyGoSeeker to select a video to download.

The EXE only helps extract the extension. After updating, reload the extension and refresh video pages.

Record captures only the content played during recording. Some DRM-protected or encrypted videos cannot be downloaded.

See [THIRD_PARTY_NOTICES.md](https://github.com/aatrox9029/MyGoSeeker/blob/main/THIRD_PARTY_NOTICES.md) for dependency provenance.  
