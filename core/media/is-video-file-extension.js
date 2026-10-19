import { VIDEO_FILE_EXTENSIONS } from "./media-constants.js";
export function isVideoFileExtension(ext) {
  return VIDEO_FILE_EXTENSIONS.has(ext);
}
