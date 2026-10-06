import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("setup_helper", Path(__file__).resolve().parents[1] / "scripts" / "setup-helper.py")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class SetupTests(unittest.TestCase):
    def test_extract_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "test.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("manifest.json", json.dumps({"version": "1.2.1"}))
            helper.bundled_archive = lambda: archive_path
            result = helper.extract_extension(Path(directory) / "output")
            self.assertEqual(result["version"], "1.2.1")
            self.assertFalse(result["nativeHostInstalled"])

    def test_reject_path_escape_before_extracting(self):
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "test.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("../escaped.txt", "bad")
            helper.bundled_archive = lambda: archive_path
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                helper.extract_extension(Path(directory) / "output")
            self.assertFalse((Path(directory) / "escaped.txt").exists())


if __name__ == "__main__":
    unittest.main()
