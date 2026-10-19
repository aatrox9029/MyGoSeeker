async function captureFrameThumbnail(video) {
  // Metadata alone does not guarantee a decoded frame. Never cache that blank canvas.
  if (video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
    recordThumbnailDebug(video, "frame-not-ready");
    return "";
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = Math.max(1, Math.round(320 * video.videoHeight / video.videoWidth));
    // Bound very tall videos while preserving aspect ratio.
    if (canvas.height > 320) { canvas.width = Math.max(1, Math.round(320 * video.videoWidth / video.videoHeight)); canvas.height = 320; }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbnail = canvas.toDataURL("image/jpeg", 0.8);
    if (!thumbnail.startsWith("data:image/jpeg;base64,")) throw new Error("JPEG encoding failed");
    recordThumbnailDebug(video, "frame-captured");
    return thumbnail;
  } catch (error) {
    recordThumbnailDebug(video, "frame-failed", `${error.name}: ${error.message}`);
    if (error.name === "SecurityError") return captureVisibleThumbnail(video);
    return "";
  }
}
