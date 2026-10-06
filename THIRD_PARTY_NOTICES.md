# Third-party components

The extension bundles the unmodified ESM build of `@ffmpeg/core` 0.12.9 (single thread), pinned in package-lock.json, and the existing `@ffmpeg/ffmpeg` 0.12 wrapper. The core assets are copied with `python scripts/sync-ffmpeg.py` after `npm ci`.

- FFmpeg WebAssembly core: GPL-2.0-or-later. Upstream source and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/core%400.12.9 . Package provenance and checksums are recorded in package-lock.json. GPL text is included at vendor/ffmpeg/GPL-2.0.txt.
- JavaScript wrapper: MIT. Upstream: https://github.com/ffmpegwasm/ffmpeg.wasm . MIT text is included at vendor/ffmpeg/MIT.txt.
- PyInstaller is used only to package the extraction assistant. Its bootloader redistribution exception is described at https://pyinstaller.org/en/stable/license.html .

The setup EXE contains the extension ZIP and uses the Python standard library for extraction and the installation dialog. No system FFmpeg executable or native messaging host is bundled.
