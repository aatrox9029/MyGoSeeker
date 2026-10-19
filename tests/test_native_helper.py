import io
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import types
from urllib.request import Request

from native_helper.control import Control, Cancelled
from native_helper.framing import MessageWriter, read_message
from native_helper.host import Host
from native_helper.network import SafeRedirect, cookie_jar, safe_headers, validate_url
from native_helper.output import reserve_output
from native_helper.health import health_status
from native_helper.registration import host_manifest
from native_helper.registration import install, uninstall, REGISTRY_PATHS, HOST_NAME

ROOT = Path(__file__).resolve().parents[1]
EXTENSION_ID = "a" * 32


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith("/fail"):
            self.send_error(403)
            return
        if self.path == "/cookie.mp4" and "session=secret" not in self.headers.get("Cookie", ""):
            self.send_error(401)
            return
        if self.path == "/html.mp4":
            body, content_type = b"<html>login</html>", "text/html"
        elif self.path == "/slow.mp4":
            body, content_type = b"x" * (2 * 1024 * 1024), "video/mp4"
        else:
            path = self.server.media / self.path.split("?")[0].lstrip("/")
            body = path.read_bytes() if path.is_file() else b"media-content"
            content_type = "application/vnd.apple.mpegurl" if path.suffix == ".m3u8" else "video/mp4"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            for offset in range(0, len(body), 64 * 1024):
                self.wfile.write(body[offset:offset + 64 * 1024])
                self.wfile.flush()
                if self.path == "/slow.mp4":
                    time.sleep(0.04)
        except (ConnectionError, OSError):
            pass


class NativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.media = Path(cls.temporary.name)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.server.media = cls.media
        cls.server.daemon_threads = True
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()
        cls.temporary.cleanup()

    def test_framing_and_corrupt_messages(self):
        stream = io.BytesIO()
        writer = MessageWriter(stream)
        writer({"type": "HELLO", "text": "測試"})
        stream.seek(0)
        self.assertEqual(read_message(stream)["text"], "測試")
        self.assertIsNone(read_message(stream))
        for raw in [b"x", struct.pack("<I", 2) + b"{", struct.pack("<I", 2 * 1024 * 1024), struct.pack("<I", 2) + b"[]"]:
            with self.assertRaises(ValueError):
                read_message(io.BytesIO(raw))

    def test_health_checks_both_tools_without_modifying_registration(self):
        with patch("native_helper.health.find_tools", return_value=("ffmpeg", "ffprobe")), patch("native_helper.health.subprocess.run", return_value=types.SimpleNamespace(returncode=0)) as run:
            result = health_status({})
            self.assertTrue(result["ffmpeg"])
            self.assertTrue(result["ffprobe"])
            self.assertEqual(run.call_count, 2)
        with patch("native_helper.health.find_tools", side_effect=FileNotFoundError("private-path")):
            result = health_status({})
            self.assertFalse(result["ffmpeg"])
            self.assertNotIn("private-path", result["error"])

    def test_scoped_context_and_redirect(self):
        for url in ["file:///C:/secret", "https://user:pass@example.com/x", "data:hello"]:
            with self.assertRaises(ValueError):
                validate_url(url)
        with self.assertRaises(ValueError):
            safe_headers({"headers": {"Authorization": "secret\r\nInjected: true"}})
        req = Request("https://one.example/a", headers={"Authorization": "secret", "Referer": "https://one.example/?secret", "Cookie": "secret", "Accept": "*/*"})
        redirected = SafeRedirect().redirect_request(req, None, 302, "", {}, "https://two.example/b")
        self.assertIsNone(redirected.get_header("Authorization"))
        self.assertIsNone(redirected.get_header("Cookie"))
        jar = cookie_jar({"cookies": [{"name": "session", "value": "secret", "domain": "one.example", "path": "/", "secure": True}]})
        req = Request("https://two.example/a")
        jar.add_cookie_header(req)
        self.assertIsNone(req.get_header("Cookie"))

    def test_manifest_and_output_paths(self):
        manifest = host_manifest(ROOT / "helper.exe", [EXTENSION_ID])
        self.assertEqual(manifest["allowed_origins"], [f"chrome-extension://{EXTENSION_ID}/"])
        for ids in [[], ["*"], ["a" * 31], ["z" * 32]]:
            with self.assertRaises(ValueError):
                host_manifest("helper.exe", ids)
        with tempfile.TemporaryDirectory() as directory:
            first, _ = reserve_output(directory, "../../CON.mp4")
            second, _ = reserve_output(directory, "../../CON.mp4")
            self.assertEqual(first.parent, Path(directory).resolve())
            self.assertNotEqual(first, second)
            self.assertTrue(first.exists())

    def test_registration_install_uninstall_and_rollback(self):
        values = {}
        class Key:
            def __init__(self, path): self.path = path
            def __enter__(self): return self
            def __exit__(self, *args): pass
        def open_key(root, path):
            if path not in values: raise FileNotFoundError()
            return Key(path)
        def create_key(root, path):
            values.setdefault(path, "")
            return Key(path)
        fake = types.SimpleNamespace(HKEY_CURRENT_USER=1, REG_SZ=1, OpenKey=open_key, CreateKey=create_key,
            QueryValueEx=lambda key, name: (values[key.path], 1),
            SetValueEx=lambda key, name, zero, kind, value: values.__setitem__(key.path, value),
            DeleteKey=lambda root, path: values.pop(path))
        with tempfile.TemporaryDirectory() as directory, patch.dict("sys.modules", {"winreg": fake}):
            directory = Path(directory)
            source = directory / "source.exe"
            source.write_bytes(b"test executable")
            destination = directory / "installed"
            result = install([EXTENSION_ID], source=source, destination=destination)
            self.assertTrue(result["nativeHostInstalled"])
            self.assertEqual(set(values), {
                rf"Software\{browser}\NativeMessagingHosts\{HOST_NAME}"
                for browser in [r"Google\Chrome", r"Microsoft\Edge", r"BraveSoftware\Brave-Browser"]
            })
            previous_values = values.copy()
            manifest_file = destination / f"{HOST_NAME}.json"
            previous_manifest = manifest_file.read_bytes()
            original_set = fake.SetValueEx
            def fail_once(key, *args):
                if "BraveSoftware" in key.path:
                    fake.SetValueEx = original_set
                    raise OSError("Brave registration error")
                original_set(key, *args)
            fake.SetValueEx = fail_once
            with self.assertRaises(OSError):
                install(["b" * 32], source=source, destination=destination)
            self.assertEqual(manifest_file.read_bytes(), previous_manifest)
            self.assertEqual(values, previous_values)
            with patch("native_helper.registration.install_directory", return_value=destination):
                self.assertEqual(len(uninstall()["unregistered"]), 3)
            self.assertEqual(values, {})

    def job(self, url, job_id="test", **fields):
        return {"jobId": job_id, "sourceType": "direct", "mediaUrl": self.base + url, "outputName": "video.mp4", **fields}

    def wait_done(self, host, job_id="test"):
        host.jobs[job_id]["thread"].join(30)
        self.assertTrue(host.jobs[job_id]["done"], "Native job timed out")

    def test_direct_cookie_completion_failure_and_report_redaction(self):
        with tempfile.TemporaryDirectory() as directory:
            events = []
            host = Host(events.append, {"downloadDirectory": directory})
            context = {"cookies": [{"name": "session", "value": "secret", "domain": "127.0.0.1", "path": "/"}]}
            host.dispatch({"type": "START_JOB", "job": self.job("/cookie.mp4", requestContext=context)})
            self.wait_done(host)
            self.assertEqual(events[-1]["type"], "JOB_COMPLETED")
            self.assertEqual((Path(directory) / "video.mp4").read_bytes(), b"media-content")
            host.dispatch({"type": "START_JOB", "job": self.job("/fail?token=TOPSECRET", "bad")})
            self.wait_done(host, "bad")
            host.dispatch({"type": "EXPORT_REPORT", "jobId": "bad"})
            self.assertNotIn("TOPSECRET", events[-1]["reportBody"])
            self.assertIn("HTTP 403", events[-1]["reportBody"])
            host.dispatch({"type": "START_JOB", "job": self.job("/html.mp4", "html")})
            self.wait_done(host, "html")
            self.assertEqual(host.jobs["html"]["status"], "error")
            self.assertEqual(len(list(Path(directory).iterdir())), 1)
            host.close()

    def test_pause_resume_cancel_and_limits(self):
        with tempfile.TemporaryDirectory() as directory:
            events = []
            host = Host(events.append, {"downloadDirectory": directory})
            host.dispatch({"type": "START_JOB", "job": self.job("/slow.mp4")})
            control = host.jobs["test"]["control"]
            control.pause()
            time.sleep(0.15)
            self.assertFalse(host.jobs["test"]["done"])
            control.resume()
            self.wait_done(host)
            self.assertEqual(host.jobs["test"]["status"], "completed")
            host.dispatch({"type": "START_JOB", "job": self.job("/slow.mp4", "cancel")})
            host.dispatch({"type": "PAUSE_JOB", "jobId": "cancel"})
            host.dispatch({"type": "CANCEL_JOB", "jobId": "cancel"})
            self.wait_done(host, "cancel")
            self.assertEqual(host.jobs["cancel"]["status"], "cancelled")
            self.assertEqual(len(list(Path(directory).iterdir())), 1)
            host.dispatch({"type": "START_JOB", "job": self.job("/slow.mp4", "one")})
            host.dispatch({"type": "START_JOB", "job": self.job("/slow.mp4", "two")})
            host.dispatch({"type": "START_JOB", "job": self.job("/slow.mp4", "three")})
            self.assertNotIn("three", host.jobs)
            self.assertEqual(events[-1]["type"], "JOB_FAILED")
            host.close()

    def test_missing_native_hls_tools_have_actionable_safe_diagnostics(self):
        with tempfile.TemporaryDirectory() as directory, patch("native_helper.remux.shutil.which", return_value=None):
            events = []
            host = Host(events.append, {"downloadDirectory": directory})
            host.dispatch({"type": "START_JOB", "job": self.job("/secret.m3u8?token=TOPSECRET", sourceType="hls")})
            self.wait_done(host)
            failure = events[-1]
            self.assertEqual(failure["errorCode"], "E_NATIVE_HOST_UNAVAILABLE")
            self.assertIn("FFmpeg and ffprobe", failure["message"])
            self.assertNotIn("TOPSECRET", json.dumps(events))
            self.assertEqual(list(Path(directory).iterdir()), [])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "Install FFmpeg and ffprobe")
    def test_hls_native_remux_with_separate_audio(self):
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=24",
                        "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-c:a", "aac", str(self.media / "source.mp4")], check=True)
        for track, flag in [("video", "-an"), ("audio", "-vn")]:
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(self.media / "source.mp4"),
                            flag, "-c", "copy", "-hls_time", "1", "-hls_list_size", "0", str(self.media / f"{track}.m3u8")], check=True)
        with tempfile.TemporaryDirectory() as directory:
            events = []
            host = Host(events.append, {"downloadDirectory": directory})
            host.dispatch({"type": "START_JOB", "job": self.job("/video.m3u8", sourceType="hls", audioUrl=self.base + "/audio.m3u8")})
            self.wait_done(host)
            self.assertEqual(events[-1]["type"], "JOB_COMPLETED", events)
            streams = events[-1]["validation"]["probe"]["streams"]
            self.assertEqual({item["codec_type"] for item in streams}, {"audio", "video"})
            host.dispatch({"type": "START_JOB", "job": self.job("/video.m3u8", "paused-hls", sourceType="hls", audioUrl=self.base + "/audio.m3u8")})
            item = host.jobs["paused-hls"]
            deadline = time.monotonic() + 5
            while item["control"].process is None and not item["done"] and time.monotonic() < deadline:
                time.sleep(0.001)
            self.assertIsNotNone(item["control"].process)
            host.dispatch({"type": "PAUSE_JOB", "jobId": "paused-hls"})
            time.sleep(0.1)
            self.assertFalse(item["done"])
            host.dispatch({"type": "RESUME_JOB", "jobId": "paused-hls"})
            self.wait_done(host, "paused-hls")
            self.assertEqual(item["status"], "completed", events)
            self.assertEqual(len(list(Path(directory).glob("*.mp4"))), 2)
            self.assertEqual(len(list(Path(directory).glob("*.part"))), 0)
            host.close()

    def test_entry_point_protocol_and_origin_check(self):
        executable = __import__("os").environ.get("MGS_NATIVE_EXE")
        command = [executable] if executable else [__import__("sys").executable, str(ROOT / "scripts" / "native-helper.py")]
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            (directory / "config.json").write_text(json.dumps({"downloadDirectory": str(directory / "downloads")}))
            (directory / "com.video_downloader_assistant.host.json").write_text(json.dumps(host_manifest(command[0], [EXTENSION_ID])))
            process = subprocess.Popen(command + [f"chrome-extension://{EXTENSION_ID}/", "--config", str(directory / "config.json")],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            writer = MessageWriter(process.stdin)
            try:
                writer({"type": "HELLO", "requestId": "hello"})
                self.assertEqual(read_message(process.stdout)["type"], "READY")
                writer({"type": "PING", "requestId": "ping"})
                self.assertEqual(read_message(process.stdout)["requestId"], "ping")
                writer({"type": "HEALTH_CHECK", "requestId": "health"})
                health = read_message(process.stdout)
                self.assertEqual(health["type"], "HEALTH_STATUS")
                self.assertEqual(health["requestId"], "health")
                self.assertTrue(health["connected"])
                self.assertIn("ffmpeg", health)
                self.assertIn("ffprobe", health)
                writer({"type": "START_JOB", "job": self.job("/direct.mp4")})
                while True:
                    message = read_message(process.stdout)
                    if message["type"] == "JOB_COMPLETED":
                        break
                writer({"type": "EXPORT_REPORT", "jobId": "test"})
                self.assertEqual(read_message(process.stdout)["type"], "JOB_REPORT_READY")
                process.stdin.close()
                self.assertEqual(process.wait(timeout=30), 0)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()
                for pipe in [process.stdin, process.stdout, process.stderr]:
                    pipe.close()
            rejected = subprocess.run(command + [f"chrome-extension://{'b' * 32}/", "--config", str(directory / "config.json")],
                                      input=b"", capture_output=True, timeout=30)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertEqual(rejected.stdout, b"")


if __name__ == "__main__":
    unittest.main()
