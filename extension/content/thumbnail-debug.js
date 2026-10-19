const thumbnailDebugByVideo = new WeakMap();
function recordThumbnailDebug(video, stage, detail = "") {
  const entries = thumbnailDebugByVideo.get(video) || [];
  entries.push({ stage, detail, readyState: video.readyState, width: video.videoWidth,
    height: video.videoHeight, time: Date.now() });
  thumbnailDebugByVideo.set(video, entries.slice(-12));
}
function getThumbnailDebug(video) {
  return { entries: thumbnailDebugByVideo.get(video) || [] };
}
