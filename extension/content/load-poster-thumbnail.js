function loadPosterThumbnail(video, url) {
  return new Promise((resolve) => {
    const image = new Image();
    let finished = false;
    const finish = (value, reason) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      image.onload = image.onerror = null;
      recordThumbnailDebug(video, value ? "poster-loaded" : "poster-failed", reason);
      resolve(value);
    };
    const timer = setTimeout(() => finish("", "Image load timed out"), 3000);
    image.onload = () => finish(image.naturalWidth && image.naturalHeight ? url : "", "Image load completed");
    image.onerror = () => finish("", "Image load failed");
    image.src = url;
  });
}
