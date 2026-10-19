import { isNonVideoMime } from "./is-non-video-mime.js";
export function shouldAcceptNetworkCandidate(url, detectedType, meta) {
  if (!url || !detectedType) {
    return false;
  }
  if (["m3u8", "mpd"].includes(detectedType)) {
    return true;
  }
  if (!meta || typeof meta !== "object") {
    return false;
  }
  if (Number.isInteger(meta.statusCode) && meta.statusCode >= 400) {
    return false;
  }

  const requestType = String(meta.requestType || "").toLowerCase();
  if (["image", "script", "stylesheet", "font", "ping", "csp_report", "imageset", "sub_frame", "main_frame"].includes(requestType)) {
    return false;
  }

  const contentType = String(meta.contentType || "").toLowerCase();
  if (contentType) {
    if (contentType.startsWith("video/")) {
      return true;
    }
    if (contentType.includes("application/octet-stream")) {
      return true;
    }
    if (isNonVideoMime(contentType) || contentType.startsWith("image/")) {
      return false;
    }
  }

  const disposition = String(meta.contentDisposition || "").toLowerCase();
  if (disposition.includes("attachment")) {
    return true;
  }

  return requestType === "media" || requestType === "object";
}
