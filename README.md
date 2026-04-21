<p align="center">
  <img width="128" height="128" alt="icon" src="https://github.com/user-attachments/assets/30a4b012-29f8-4c2e-abb9-851c2e0df85c" />
</p>

<h1 align="center">MyGoSeeker</h1>

<p align="center">
  A browser extension and native helper for detecting, organizing, and downloading videos with a reliability-first workflow.
</p>

<p align="center">
  Built for practical downloading, HLS handling, browser integration, and clear install/release packaging.
</p>

## Overview

MyGoSeeker combines:

- a browser extension for detection, UI, page context, and save orchestration
- a Go native host for direct downloads, HLS remuxing, validation, and selective fallback handling
- a release workflow that produces a packaged plugin plus `setup.exe`

The project is designed to keep browser-specific work inside the extension while moving failure-prone download and remux tasks into a native helper.

## Highlights

- Detects downloadable media from the current page
- Supports direct file downloads and HLS workflows
- Uses browser-side FFmpeg wasm for offscreen remux/finalization where needed
- Uses a Go native host for direct download, native HLS remux, validation, and selective `yt-dlp` fallback
- Includes setup/install scripts and release-package generation

## Architecture

### Browser Extension

- `background.js`, `content.js`, `popup.*`, `options.*`
- `core/` for download, HLS, save, remux planning, and debug modules
- `extension/` for native messaging bridge and popup/background helpers
- `vendor/ffmpeg/` for browser-side FFmpeg wrapper/core assets

### Native Host

- `native-host/`
- Go-based native messaging host
- Handles direct/native transfers, native HLS remux, validation, and selective extractor fallback

## Quick Start

### Requirements

- Windows
- Node.js
- Go
- A Chromium-based browser for the extension workflow

### Build Release Artifacts

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-release.ps1
```
