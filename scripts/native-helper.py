"""Optional installer UI and native host entry point."""
import argparse
import io
import json
import os
from pathlib import Path
import sys

if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from native_helper.framing import MessageWriter, read_message
from native_helper.host import Host
from native_helper.registration import install, install_directory, uninstall, HOST_NAME


def serve(origin, config_path=None):
    config_path = Path(config_path or Path(sys.executable).parent / "config.json")
    manifest = json.loads((config_path.parent / f"{HOST_NAME}.json").read_text(encoding="utf-8"))
    if origin not in manifest["allowed_origins"]:
        raise ValueError("Calling extension is not registered")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if os.name == "nt":
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    host = Host(MessageWriter(sys.stdout.buffer), config)
    try:
        while True:
            message = read_message(sys.stdin.buffer)
            if message is None:
                break
            host.dispatch(message)
    finally:
        host.close()


def main():
    parser = argparse.ArgumentParser(description="MyGoSeeker 1.0.2 optional native helper")
    parser.add_argument("origin", nargs="?")
    parser.add_argument("--parent-window")
    parser.add_argument("--install", nargs="+", metavar="EXTENSION_ID")
    parser.add_argument("--uninstall", action="store_true")
    parser.add_argument("--download-directory")
    parser.add_argument("--ffmpeg")
    parser.add_argument("--self-test", action="store_true")
    # Used by automated isolated protocol tests, never registered in browser manifests.
    parser.add_argument("--config")
    args = parser.parse_args()
    if args.self_test:
        stream = io.BytesIO()
        MessageWriter(stream)({"type": "HELLO", "requestId": "test"})
        stream.seek(0)
        messages = []
        Host(messages.append, {}).dispatch(read_message(stream))
        assert messages[0]["type"] == "READY"
        print(json.dumps({"ok": True, "version": "1.0.2", "nativeHelper": True}))
    elif args.install:
        print(json.dumps(install(args.install, download_directory=args.download_directory, ffmpeg=args.ffmpeg)))
    elif args.uninstall:
        print(json.dumps(uninstall()))
    elif args.origin:
        serve(args.origin, args.config)
    else:
        import tkinter as tk
        from tkinter import messagebox, simpledialog
        root = tk.Tk()
        root.withdraw()
        identifier = simpledialog.askstring("MyGoSeeker optional Native helper",
            "Paste the extension ID from chrome://extensions, edge://extensions or brave://extensions.\n"
            "Separate Chrome, Edge and Brave IDs with spaces.\n\n"
            "Optional: requires enabling Native helper in extension settings.\n"
            "HLS needs FFmpeg and ffprobe installed. Direct HTTP downloads need neither.", parent=root)
        if identifier:
            try:
                result = install(identifier.split())
                messagebox.showinfo("MyGoSeeker", "Native helper registered for Chrome / Edge / Brave.\n"
                    "Enable Native helper in extension settings, then refresh helper status.\n"
                    f"Downloads: {result['downloadDirectory']}\nHLS tools detected: {result['hlsToolsDetected']}")
            except Exception as error:
                messagebox.showerror("MyGoSeeker", str(error))
        root.destroy()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never write unframed error text or signed request URLs to stdout.
        print(f"Native helper stopped: {type(error).__name__}", file=sys.stderr)
        sys.exit(1)
