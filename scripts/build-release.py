"""Build extension ZIP, extraction assistant, and separate optional native helper."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile


def main():
    root = Path(__file__).resolve().parent.parent
    version = json.loads((root / "manifest.json").read_text(encoding="utf-8"))["version"]
    from datetime import datetime, timezone
    revision = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=root, capture_output=True, text=True).stdout.strip() or "workspace"
    dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=root, capture_output=True, text=True).stdout.strip())
    info = {"version": version, "builtAt": datetime.now(timezone.utc).isoformat(), "revision": revision, "workspaceChanges": dirty}
    (root / "core" / "debug" / "build-info.js").write_text("export const BUILD_INFO = " + json.dumps(info) + ";\n", encoding="utf-8")
    output = root / "dist"
    output.mkdir(exist_ok=True)
    # Curated include list prevents dependencies, profiles, and build output from entering the extension.
    files = [path for path in root.iterdir() if path.suffix in {".js", ".html", ".css", ".png"}]
    files.append(root / "manifest.json")
    # Source exports may omit prose documentation; the extension still builds.
    files += [root / name for name in ["README.md", "README.en.md", "IMPROVEMENTS.md", "NATIVE_HELPER.md", "THIRD_PARTY_NOTICES.md"] if (root / name).is_file()]
    for directory in ["core", "extension", "shared", "vendor"]:
        files += [path for path in (root / directory).rglob("*") if path.is_file() and path.stat().st_size > 0]
    archive_path = output / f"MyGoSeeker-{version}-Extension.zip"
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files):
            entry = zipfile.ZipInfo(path.relative_to(root).as_posix(), (2026, 10, 6, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes())
    build_input = root / "build" / "release-input"
    build_input.mkdir(parents=True, exist_ok=True)
    bundled_zip = build_input / "extension.zip"
    shutil.copyfile(archive_path, bundled_zip)
    name = f"MyGoSeeker-{version}-Setup"
    if (output / f"{name}.exe").exists():
        # Keep existing executables: a running older version never blocks the new build.
        from datetime import datetime
        name += "-" + datetime.now().strftime("%Y%m%d-%H%M%S")
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile",
                    "--name", name, "--distpath", str(output), "--workpath", str(root / "build" / "pyinstaller"),
                    "--specpath", str(root / "build"), "--add-data", f"{bundled_zip};.",
                    str(root / "scripts" / "setup-helper.py")], cwd=root, check=True)
    executable = output / f"{name}.exe"
    subprocess.run([str(executable), "--self-test"], check=True)
    helper_name = f"MyGoSeeker-{version}-NativeHelper"
    if (output / f"{helper_name}.exe").exists():
        from datetime import datetime
        helper_name += "-" + datetime.now().strftime("%Y%m%d-%H%M%S")
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile",
                    "--name", helper_name, "--distpath", str(output), "--workpath", str(root / "build" / "native-pyinstaller"),
                    "--specpath", str(root / "build"), "--paths", str(root),
                    str(root / "scripts" / "native-helper.py")], cwd=root, check=True)
    native_executable = output / f"{helper_name}.exe"
    subprocess.run([str(native_executable), "--self-test"], check=True)
    hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in [archive_path, executable, native_executable]}
    (output / "SHA256.json").write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"version": version, "zip": str(archive_path), "exe": str(executable), "nativeHelper": str(native_executable)}, indent=2))


if __name__ == "__main__":
    main()
