"""Extract the bundled Chromium extension. This is not a native messaging host."""
import argparse
import json
from pathlib import Path
import sys
import zipfile


def bundled_archive():
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "extension.zip"
    root = Path(__file__).resolve().parent.parent
    version = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["version"]
    return root / "dist" / f"MyGoSeeker-{version}-Extension.zip"


def extract_extension(destination):
    destination = Path(destination).resolve()
    with zipfile.ZipFile(bundled_archive()) as archive:
        for entry in archive.infolist():
            target = (destination / entry.filename).resolve()
            if not target.is_relative_to(destination):
                raise ValueError("Unsafe archive path")
        destination.mkdir(parents=True, exist_ok=True)
        archive.extractall(destination)
    manifest = json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
    return {"path": str(destination), "version": manifest["version"], "nativeHostInstalled": False}


def main():
    parser = argparse.ArgumentParser(description="MyGoSeeker extension extraction assistant")
    parser.add_argument("--extract", help="Extract extension into the specified folder without opening the UI")
    parser.add_argument("--self-test", action="store_true", help="Validate the bundled ZIP without installing")
    args = parser.parse_args()
    if args.self_test:
        with zipfile.ZipFile(bundled_archive()) as archive:
            if archive.testzip():
                raise ValueError("Corrupt bundled archive")
            manifest = json.loads(archive.read("manifest.json"))
            print(json.dumps({"ok": True, "version": manifest["version"], "files": len(archive.namelist())}))
        return
    if args.extract:
        print(json.dumps(extract_extension(args.extract)))
        return
    import tkinter as tk
    from tkinter import filedialog, messagebox
    root = tk.Tk()
    root.withdraw()
    directory = filedialog.askdirectory(title="選擇 MyGoSeeker 擴充功能的解壓位置")
    if directory:
        try:
            with zipfile.ZipFile(bundled_archive()) as archive:
                version = json.loads(archive.read("manifest.json"))["version"]
            result = extract_extension(Path(directory) / f"MyGoSeeker-{version}")
            messagebox.showinfo("MyGoSeeker", f"解壓完成：{result['path']}\n\n請在 Chrome / Edge 擴充功能頁面啟用開發人員模式，再選擇『載入未封裝項目』並選取上述資料夾。\n\n此助手只解壓擴充功能，不會安裝或更新原生下載器。")
        except Exception as error:
            messagebox.showerror("MyGoSeeker", str(error))
    root.destroy()


if __name__ == "__main__":
    main()
