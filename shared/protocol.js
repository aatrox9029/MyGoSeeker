export const NATIVE_HOST_NAME = "com.video_downloader_assistant.host";

export const REQUEST_TYPES = Object.freeze({
  HELLO: "HELLO",
  START_JOB: "START_JOB",
  CANCEL_JOB: "CANCEL_JOB",
  PAUSE_JOB: "PAUSE_JOB",
  RESUME_JOB: "RESUME_JOB",
  QUERY_JOB: "QUERY_JOB",
  EXPORT_REPORT: "EXPORT_REPORT",
  PING: "PING"
});

export const EVENT_TYPES = Object.freeze({
  READY: "READY",
  JOB_ACCEPTED: "JOB_ACCEPTED",
  JOB_PROGRESS: "JOB_PROGRESS",
  JOB_STAGE: "JOB_STAGE",
  JOB_WARNING: "JOB_WARNING",
  JOB_RETRY: "JOB_RETRY",
  JOB_FAILED: "JOB_FAILED",
  JOB_COMPLETED: "JOB_COMPLETED",
  JOB_REPORT_READY: "JOB_REPORT_READY",
  LOG: "LOG",
  PONG: "PONG"
});

export const ERROR_CODES = Object.freeze({
  E_CTX_MISSING: "E_CTX_MISSING",
  E_AUTH_REQUIRED: "E_AUTH_REQUIRED",
  E_HTTP_FORBIDDEN: "E_HTTP_FORBIDDEN",
  E_PLAYLIST_PARSE: "E_PLAYLIST_PARSE",
  E_SEGMENT_FETCH: "E_SEGMENT_FETCH",
  E_FFMPEG_REMUX: "E_FFMPEG_REMUX",
  E_FFPROBE_INVALID: "E_FFPROBE_INVALID",
  E_OUTPUT_WRITE: "E_OUTPUT_WRITE",
  E_OUTPUT_LOCKED: "E_OUTPUT_LOCKED",
  E_SOURCE_UNRECOVERABLE: "E_SOURCE_UNRECOVERABLE",
  E_RECORDED_FALLBACK_ABORTED: "E_RECORDED_FALLBACK_ABORTED",
  E_NATIVE_HOST_UNAVAILABLE: "E_NATIVE_HOST_UNAVAILABLE"
});

export const HEADER_ALLOWLIST = Object.freeze([
  "referer",
  "origin",
  "user-agent",
  "authorization",
  "accept",
  "accept-language"
]);

let requestCounter = 0;

export function createRequestId(prefix = "req") {
  requestCounter += 1;
  return `${prefix}_${Date.now()}_${requestCounter}`;
}
