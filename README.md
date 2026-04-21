<p align="center">
  <img src="logo.png" alt="MyGoSeeker logo" width="128">
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
- Ships with headless regression checks and Go test coverage

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

### Packaging

- `scripts/` for build, install, release, and vendor sync automation
- `release-package/` for publish-ready setup bundles

## Repository Structure

```text
.
|- core/
|- extension/
|- native-host/
|- packaging/
|- scripts/
|- shared/
|- tests/
|- vendor/
|- background.js
|- content.js
|- manifest.json
`- offscreen.js
```

## Quick Start

### Requirements

- Windows
- Node.js
- Go
- A Chromium-based browser for the extension workflow

### Development Checks

```powershell
cmd /c npm run test:headless
go test ./...
```

### Build Release Artifacts

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

This generates a fresh release package containing:

- `setup.exe`
- `setup.exe.sha256`
- unpacked `plugin/`

## Current Release Workflow

The project currently builds:

- extension package artifacts in `dist/`
- native host executable via `native-host/`
- canonical publishable bundle in `release-package/`

The release package is the primary publish target for GitHub releases.

## Licensing

The original project code in this repository is licensed under the MIT License.

See:

- [LICENSE](LICENSE)
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- [ASSET_SOURCES.md](ASSET_SOURCES.md)
- [OPEN_SOURCE_COMPLIANCE_GUIDE.md](OPEN_SOURCE_COMPLIANCE_GUIDE.md)

### Third-Party Notes

- Browser-side FFmpeg packages are documented in `THIRD_PARTY_NOTICES.md`
- `yt-dlp` is currently used only as a selective extractor fallback in the native host
- If future releases bundle additional third-party binaries, those exact artifacts should be reviewed and documented separately

## Publishing Note

The repository now includes the main open-source compliance files, but asset provenance for `icon.png` / `logo.png` should still be verified or replaced before a final public GitHub release.
