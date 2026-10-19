"""Native FFmpeg HLS remux and ffprobe validation. Never invoke a shell."""
import json
from pathlib import Path
import shutil
import subprocess
import threading
import time

from native_helper.network import cookie_jar, safe_headers, validate_url
from native_helper.errors import NativeDownloadError


def find_tools(config):
    ffmpeg = config.get("ffmpeg") or shutil.which("ffmpeg")
    ffprobe = config.get("ffprobe") or (str(Path(ffmpeg).with_name("ffprobe.exe")) if ffmpeg else None)
    if not ffprobe or not Path(ffprobe).is_file():
        ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not Path(ffmpeg).is_file() or not ffprobe:
        raise NativeDownloadError("E_NATIVE_HOST_UNAVAILABLE", "HLS requires installed FFmpeg and ffprobe; reinstall helper after installing the tools")
    return str(Path(ffmpeg).resolve()), str(Path(ffprobe).resolve())


def download_hls(job, destination, control, emit, config):
    ffmpeg, ffprobe = find_tools(config)
    context = job.get("requestContext", {})
    headers = safe_headers(context)
    # FFmpeg forwards arbitrary headers to child requests. Avoid forwarding bearer tokens.
    if any(name.lower() == "authorization" for name in headers):
        raise NativeDownloadError("E_AUTH_REQUIRED", "HLS Authorization headers require the extension downloader")
    args = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
    input_args = ["-rw_timeout", "20000000",
            "-protocol_whitelist", "http,https,tcp,tls,crypto", "-headers",
            "".join(f"{name}: {value}\r\n" for name, value in headers.items())]
    cookies = "".join(f"{c.name}={c.value}; path={c.path}; domain={c.domain};{' secure;' if c.secure else ''}\n" for c in cookie_jar(context)
                      if not c.is_expired())
    if cookies:
        input_args += ["-cookies", cookies]
    args += input_args + ["-i", validate_url(job["mediaUrl"])]
    if job.get("audioUrl"):
        args += input_args + ["-i", validate_url(job["audioUrl"])]
    args += ["-map", "0:v:0?", "-map", "1:a:0?" if job.get("audioUrl") else "0:a:0?", "-c", "copy",
             "-movflags", "+faststart", "-progress", "pipe:1", "-f", "mp4", str(destination)]
    while True:
        control.wait()
        emit("JOB_STAGE", stage="Native HLS remux (resume restarts remux)", percent=5)
        with control.lock:
            if control.cancelled.is_set() or not control.running.is_set():
                continue
            process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            control.process = process
        started = time.monotonic()
        def expire():
            with control.lock:
                if process.poll() is None:
                    process.kill()
        watchdog = threading.Timer(3600, expire)
        watchdog.daemon = True
        watchdog.start()
        try:
            for raw in process.stdout:
                if time.monotonic() - started > 3600:
                    control.stop_process()
                    raise NativeDownloadError("E_FFMPEG_REMUX", "Native HLS one-hour time limit reached")
                key, _, value = raw.decode("utf-8", errors="replace").strip().partition("=")
                if key == "out_time_ms":
                    emit("JOB_PROGRESS", percent=50, stage="Native HLS remux", mediaSeconds=int(value or 0) / 1000000)
            code = process.wait(timeout=25)
        finally:
            watchdog.cancel()
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdout.close()
            with control.lock:
                control.process = None
        control.wait()
        if code == 0:
            break
        # A pause terminates FFmpeg. The resume flag alone cannot identify that exit.
        if code != 0 and getattr(control, "restart", False):
            control.restart = False
            continue
        raise NativeDownloadError("E_FFMPEG_REMUX", "FFmpeg could not remux the selected HLS to MP4; use extension fallback", exitCode=code)
    result = subprocess.run([ffprobe, "-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration,size",
                             "-of", "json", str(destination)], capture_output=True, timeout=30,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    control.wait()
    if result.returncode:
        raise NativeDownloadError("E_FFPROBE_INVALID", "ffprobe rejected the remuxed output", exitCode=result.returncode)
    probe = json.loads(result.stdout)
    if not probe.get("streams") or destination.stat().st_size == 0:
        raise NativeDownloadError("E_FFPROBE_INVALID", "Output has no media streams")
    return {"ok": True, "method": "ffprobe", "probe": probe}
