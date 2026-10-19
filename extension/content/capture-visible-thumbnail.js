async function captureVisibleThumbnail(video) {
  // Cross-origin players can taint canvas. Crop only a visible, unobscured top-level player.
  if (window.top !== window || document.hidden) return "";
  const rect = video.getBoundingClientRect();
  if (rect.width < 16 || rect.height < 16 || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return "";
  const root = video.getRootNode();
  const hit = root.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (hit !== video) return "";
  try {
    const response = await chrome.runtime.sendMessage({ type: "CAPTURE_PLAYER_VIEW" });
    if (!response?.ok) throw new Error(response?.error || "Visible capture failed");
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Screenshot decode failed")); image.src = response.dataUrl; });
    const next = video.getBoundingClientRect();
    if (document.hidden || ["left", "top", "width", "height"].some((key) => Math.abs(next[key] - rect[key]) > 1)) throw new Error("Player moved during capture");
    const canvas = document.createElement("canvas");
    canvas.width = 320; canvas.height = Math.max(1, Math.round(320 * rect.height / rect.width));
    if (canvas.height > 320) { canvas.width = Math.max(1, Math.round(320 * rect.width / rect.height)); canvas.height = 320; }
    const scaleX = image.naturalWidth / innerWidth, scaleY = image.naturalHeight / innerHeight;
    canvas.getContext("2d").drawImage(image, rect.left * scaleX, rect.top * scaleY, rect.width * scaleX, rect.height * scaleY, 0, 0, canvas.width, canvas.height);
    const thumbnail = canvas.toDataURL("image/jpeg", 0.8);
    recordThumbnailDebug(video, "visible-frame-captured");
    return thumbnail;
  } catch (error) { recordThumbnailDebug(video, "visible-frame-failed", error.message); return ""; }
}
