"""Reserve collision-free output names under the configured download folder."""
from pathlib import Path
import re
import uuid


def reserve_output(directory, name):
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(name))[:160].strip(" .") or "video.mp4"
    stem, suffix = Path(name).stem, Path(name).suffix
    if stem.split(".")[0].upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
        stem = "_" + stem
    for index in range(10000):
        path = directory / f"{stem}{' (' + str(index) + ')' if index else ''}{suffix}"
        try:
            with path.open("xb"):
                pass
            return path, directory / f".mygoseeker-{uuid.uuid4().hex}.part"
        except FileExistsError:
            continue
    raise OSError("No available output filename")
