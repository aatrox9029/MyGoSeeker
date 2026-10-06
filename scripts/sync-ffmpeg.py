"""Copy the pinned ESM FFmpeg core after npm ci; do not mix old core and new wrapper."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
source = root / "node_modules" / "@ffmpeg" / "core" / "dist" / "esm"
target = root / "vendor" / "ffmpeg" / "core"
for name in ["ffmpeg-core.js", "ffmpeg-core.wasm"]:
    shutil.copyfile(source / name, target / name)
print("Synced @ffmpeg/core 0.12.9 ESM assets")
