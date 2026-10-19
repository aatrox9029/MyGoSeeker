const thumbnailCacheByVideo = new WeakMap();
async function buildThumbnail(video, detectedType) {
  const key = JSON.stringify([video.currentSrc || video.src || "", video.poster || ""]);
  let cached = thumbnailCacheByVideo.get(video);
  if (cached?.key !== key) cached = null;
  if (cached?.kind === "frame") return cached.value;
  const frame = await captureFrameThumbnail(video);
  if (frame) {
    thumbnailCacheByVideo.set(video, { key, kind: "frame", value: frame });
    return frame;
  }
  if (cached?.kind === "poster") return cached.value;
  if (video.poster && (!cached || Date.now() - cached.at >= 10000)) {
    const poster = await loadPosterThumbnail(video, absoluteUrl(video.poster));
    // A source may change while its poster is loading. Retry the new video on the next scan.
    if (key !== JSON.stringify([video.currentSrc || video.src || "", video.poster || ""])) return createPlaceholderThumbnail(detectedType);
    if (poster) {
      thumbnailCacheByVideo.set(video, { key, kind: "poster", value: poster });
      return poster;
    }
    thumbnailCacheByVideo.set(video, { key, kind: "failed", at: Date.now() });
  }
  recordThumbnailDebug(video, "placeholder", "Waiting for a readable frame or valid poster");
  return createPlaceholderThumbnail(detectedType);
}
