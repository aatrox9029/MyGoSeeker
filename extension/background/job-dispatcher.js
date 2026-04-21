export function shouldUseNativeDownload(variant) {
  if (!variant) {
    return false;
  }
  return Boolean(variant.isM3u8 || (!variant.isBlob && typeof variant.url === "string" && variant.url));
}

export function getNativeDownloadMode(variant) {
  if (variant?.isM3u8) {
    return "native-hls";
  }
  return "native-direct";
}
