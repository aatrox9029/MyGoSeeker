"""Read-only native host health; no registration or configuration writes."""
import subprocess
from native_helper.remux import find_tools


def health_status(config):
    result = {"version": "1.0.2", "connected": True, "ffmpeg": False, "ffprobe": False}
    try:
        ffmpeg, ffprobe = find_tools(config)
        for name, path in [("ffmpeg", ffmpeg), ("ffprobe", ffprobe)]:
            probe = subprocess.run([path, "-version"], capture_output=True, timeout=5,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            result[name] = probe.returncode == 0
    except Exception as error:
        result["error"] = "FFmpeg/ffprobe unavailable: " + type(error).__name__
    return result
