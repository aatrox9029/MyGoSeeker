import { getFileExtensionFromName } from "./get-file-extension-from-name.js";
import { isVideoFileExtension } from "./is-video-file-extension.js";
import { isNonVideoMime } from "./is-non-video-mime.js";
export function isProbablyVideoDownloadItem(item, attemptedVariant) {
  if (!item || item.fileSize === 0 || item.exists === false) {
    return false;
  }
  if (attemptedVariant?.isBlob || attemptedVariant?.isM3u8 || attemptedVariant?.type === "mpd") {
    return true;
  }

  const mime = typeof item.mime === "string" ? item.mime : "";
  if (isNonVideoMime(mime)) {
    return false;
  }
  if (mime.toLowerCase().startsWith("video/")) {
    return true;
  }

  const extFromFilename = getFileExtensionFromName(item.filename || "");
  if (extFromFilename) {
    return isVideoFileExtension(extFromFilename);
  }
  const extFromFinalUrl = getFileExtensionFromName(item.finalUrl || item.url || "");
  if (extFromFinalUrl) {
    return isVideoFileExtension(extFromFinalUrl);
  }
  return true;
}
