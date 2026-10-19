"""Install/register the optional host for this user only; no admin rights needed."""
import json
import os
from pathlib import Path
import re
import shutil
import sys
import time

HOST_NAME = "com.video_downloader_assistant.host"
REGISTRY_PATHS = [rf"Software\{browser}\NativeMessagingHosts\{HOST_NAME}"
                  for browser in [r"Google\Chrome", r"Microsoft\Edge", r"BraveSoftware\Brave-Browser"]]


def install_directory():
    return Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "MyGoSeeker" / "NativeHelper"


def host_manifest(executable, extension_ids):
    ids = list(dict.fromkeys(extension_ids))
    if not ids or any(not re.fullmatch(r"[a-p]{32}", identifier) for identifier in ids):
        raise ValueError("Enter the 32-letter extension ID shown in chrome://extensions, edge://extensions or brave://extensions")
    return {"name": HOST_NAME, "description": "Optional MyGoSeeker native downloader", "path": str(Path(executable).resolve()),
            "type": "stdio", "allowed_origins": [f"chrome-extension://{identifier}/" for identifier in ids]}


def install(extension_ids, source=None, destination=None, download_directory=None, ffmpeg=None):
    import winreg
    source = Path(source or sys.executable).resolve()
    if not getattr(sys, "frozen", False) and source == Path(sys.executable).resolve():
        raise ValueError("Build and run the NativeHelper EXE to install")
    directory = Path(destination or install_directory()).resolve()
    executable = directory / f"MyGoSeeker-NativeHelper-{time.time_ns()}.exe"
    manifest = host_manifest(executable, extension_ids)
    config = {"downloadDirectory": str(Path(download_directory or Path.home() / "Downloads" / "MyGoSeeker").resolve())}
    tool = ffmpeg or shutil.which("ffmpeg")
    if tool:
        tool = Path(tool).resolve()
        if not tool.is_file():
            raise ValueError("FFmpeg executable does not exist")
        config["ffmpeg"] = str(tool)
        probe = tool.with_name("ffprobe.exe")
        if probe.is_file():
            config["ffprobe"] = str(probe)
        elif shutil.which("ffprobe"):
            config["ffprobe"] = str(Path(shutil.which("ffprobe")).resolve())
    directory.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, executable)
    manifest_path = directory / f"{HOST_NAME}.json"
    # Validate everything before registration. Preserve previous registration on failure.
    previous = {}
    for path in REGISTRY_PATHS:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
                previous[path] = winreg.QueryValueEx(key, "")[0]
        except FileNotFoundError:
            previous[path] = None
    old_files = {p: p.read_bytes() if p.exists() else None for p in [manifest_path, directory / "config.json"]}
    try:
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        (directory / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
        for path in REGISTRY_PATHS:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, path) as key:
                winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path))
    except Exception:
        for path, value in previous.items():
            if value is None:
                try:
                    winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path)
                except FileNotFoundError:
                    pass
            else:
                with winreg.CreateKey(winreg.HKEY_CURRENT_USER, path) as key:
                    winreg.SetValueEx(key, "", 0, winreg.REG_SZ, value)
        for path, body in old_files.items():
            if body is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(body)
        executable.unlink(missing_ok=True)
        raise
    return {"nativeHostInstalled": True, "manifest": str(manifest_path), "downloadDirectory": config["downloadDirectory"],
            "hlsToolsDetected": bool(config.get("ffmpeg") and config.get("ffprobe"))}


def uninstall():
    import winreg
    expected = (install_directory() / f"{HOST_NAME}.json").resolve()
    removed = []
    for path in REGISTRY_PATHS:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, path) as key:
                value = winreg.QueryValueEx(key, "")[0]
            if Path(value).resolve() == expected:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, path)
                removed.append(path)
        except FileNotFoundError:
            pass
    return {"unregistered": removed, "filesRetained": str(install_directory())}
