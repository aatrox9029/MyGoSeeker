"""Build a deterministic extension ZIP and a Windows extraction assistant EXE."""
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
    output = root / "dist"
    output.mkdir(exist_ok=True)
    # Curated include list prevents dependencies, profiles, and build output from entering the extension.
    files = [path for path in root.iterdir() if path.suffix in {".js", ".html", ".css", ".png"}]
    files += [root / "manifest.json", root / "README.md", root / "THIRD_PARTY_NOTICES.md"]
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
    hashes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in [archive_path, executable]}
    (output / "SHA256.json").write_text(json.dumps(hashes, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"version": version, "zip": str(archive_path), "exe": str(executable)}, indent=2))


if __name__ == "__main__":
    main()
