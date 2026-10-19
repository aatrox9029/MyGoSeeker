"""Bounded job dispatch and redacted diagnostics for the native host."""
import json
import threading
import time
from urllib.error import HTTPError

from native_helper.control import Cancelled, Control
from native_helper.network import download_direct, validate_url
from native_helper.output import reserve_output
from native_helper.remux import download_hls
from native_helper.errors import NativeDownloadError
from native_helper.health import health_status


class Host:
    def __init__(self, send, config):
        self.send = send
        self.config = config
        self.jobs = {}

    def dispatch(self, message):
        kind, request = message.get("type"), message.get("requestId")
        if kind == "HEALTH_CHECK":
            self.send({"type": "HEALTH_STATUS", "requestId": request, **health_status(self.config)})
            return
        if kind in {"HELLO", "PING"}:
            self.send({"type": "READY" if kind == "HELLO" else "PONG", "requestId": request,
                       "version": "1.0.2", "capabilities": ["direct", "hls", "pause", "resume", "cancel", "report"]})
            return
        if kind == "START_JOB":
            job = message.get("job") or {}
            job_id = job.get("jobId")
            try:
                if not isinstance(job_id, str) or not 0 < len(job_id) <= 200 or job_id in self.jobs:
                    raise ValueError("Invalid or duplicate job ID")
                validate_url(job.get("mediaUrl", ""))
                if job.get("sourceType") not in {"direct", "hls"}:
                    raise ValueError("Unsupported native source type")
                if sum(not item["done"] for item in self.jobs.values()) >= 2:
                    raise ValueError("Native job concurrency limit reached")
                # Keep a bounded recent report cache; credentials are never retained in reports.
                for old in list(self.jobs):
                    if len(self.jobs) < 100:
                        break
                    if self.jobs[old]["done"]:
                        del self.jobs[old]
                item = {"control": Control(), "done": False, "status": "downloading", "events": [], "lastProgress": 0}
                self.jobs[job_id] = item
                self.emit(job_id, "JOB_ACCEPTED", requestId=request)
                worker = threading.Thread(target=self.run, args=(job, item), daemon=True)
                item["thread"] = worker
                worker.start()
            except Exception as error:
                self.send({"type": "JOB_FAILED", "jobId": job_id, "requestId": request,
                           "message": str(error) if isinstance(error, ValueError) else "Invalid native job"})
            return
        job_id = message.get("jobId")
        item = self.jobs.get(job_id)
        if not item:
            self.send({"type": "JOB_FAILED", "jobId": job_id, "requestId": request,
                       "message": "Native task no longer exists; retry using extension"})
            return
        if kind == "EXPORT_REPORT":
            self.send({"type": "JOB_REPORT_READY", "jobId": job_id, "requestId": request,
                       "reportBody": json.dumps({"version": "1.0.2", "jobId": job_id, "status": item["status"],
                                                  "events": list(item["events"])}, ensure_ascii=False, indent=2)})
        elif kind == "QUERY_JOB":
            self.emit(job_id, "JOB_STAGE", stage=f"Native task {item['status']}", requestId=request)
        elif kind in {"PAUSE_JOB", "RESUME_JOB", "CANCEL_JOB"} and not item["done"]:
            action = kind.split("_")[0].lower()
            getattr(item["control"], action)()
            item["status"] = {"pause": "paused", "resume": "downloading", "cancel": "cancelled"}[action]
            self.emit(job_id, "JOB_STAGE", stage=f"Native task {item['status']}", requestId=request)
        else:
            self.emit(job_id, "JOB_WARNING", message="Unknown command or finished native task", requestId=request)

    def emit(self, job_id, kind, **fields):
        item = self.jobs[job_id]
        now = time.monotonic()
        if kind == "JOB_PROGRESS" and now - item["lastProgress"] < 0.25:
            return
        if kind == "JOB_PROGRESS":
            item["lastProgress"] = now
        item["events"].append({"time": time.time(), "type": kind, **fields})
        item["events"] = item["events"][-200:]
        self.send({"type": kind, "jobId": job_id, **fields})

    def run(self, job, item):
        output = partial = None
        try:
            output, partial = reserve_output(self.config["downloadDirectory"], job.get("outputName", "video.mp4"))
            emit = lambda kind, **fields: self.emit(job["jobId"], kind, **fields)
            if job["sourceType"] == "hls":
                validation = download_hls(job, partial, item["control"], emit, self.config)
            else:
                validation = download_direct(job, partial, item["control"], emit)
            item["control"].wait()
            partial.replace(output)
            item["status"] = "completed"
            self.emit(job["jobId"], "JOB_COMPLETED", validation=validation, outputPath=str(output))
        except Cancelled:
            item["status"] = "cancelled"
        except Exception as error:
            if item["control"].cancelled.is_set():
                item["status"] = "cancelled"
            else:
                item["status"] = "error"
                # Network exceptions can contain signed URLs, cookies and auth; export only safe metadata.
                detail = f"HTTP {error.code}" if isinstance(error, HTTPError) else type(error).__name__
                message = str(error) if isinstance(error, NativeDownloadError) else f"Native download failed ({detail}); extension fallback"
                code = error.code if isinstance(error, NativeDownloadError) else "E_HTTP_FORBIDDEN" if isinstance(error, HTTPError) and error.code == 403 else "E_SOURCE_UNRECOVERABLE"
                self.emit(job["jobId"], "JOB_FAILED", message=message, errorCode=code,
                          stage="Native download failed", details=error.details if isinstance(error, NativeDownloadError) else {})
        finally:
            item["done"] = True
            if item["status"] != "completed" and output:
                output.unlink(missing_ok=True)
            if partial:
                partial.unlink(missing_ok=True)

    def close(self):
        for item in list(self.jobs.values()):
            if not item["done"]:
                item["control"].cancel()
        for item in list(self.jobs.values()):
            if item.get("thread"):
                item["thread"].join(timeout=25)
