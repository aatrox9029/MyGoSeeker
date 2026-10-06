function readAscii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectContainerSignature(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length >= 12) {
    const boxType = readAscii(bytes, 4, 4);
    if (["ftyp", "moov", "moof"].includes(boxType)) {
      return "mp4";
    }
  }
  if (bytes.length >= 189 && bytes[0] === 0x47 && bytes[188] === 0x47) {
    return "ts";
  }
  if (bytes.length >= 4 && readAscii(bytes, 0, 4) === "\x1aE\xdf\xa3") {
    return "webm";
  }
  return "unknown";
}

export async function validateFinalizedMediaBlob(blob, expectedDuration = 0) {
  const objectUrl = URL.createObjectURL(blob);
  const media = document.createElement("video");
  media.preload = "metadata";
  media.muted = true;

  try {
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        media.removeEventListener("loadedmetadata", onLoaded);
        media.removeEventListener("error", onError);
      };
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Unable to read finalized media metadata"));
      };
      media.addEventListener("loadedmetadata", onLoaded, { once: true });
      media.addEventListener("error", onError, { once: true });
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Finalized media metadata timed out"));
      }, 15000);
      media.src = objectUrl;
    });

    const duration = Number.isFinite(media.duration) ? media.duration : 0;
    const seekable = media.seekable?.length ? media.seekable.end(media.seekable.length - 1) : 0;
    const readableDuration = duration > 0;
    const seekableValid = seekable > 0 || duration > 0;
    const durationClose = expectedDuration <= 0 || Math.abs(duration - expectedDuration) < Math.max(3, expectedDuration * 0.1);
    const nonZeroSize = blob.size > 0;

    return {
      ok: nonZeroSize && readableDuration && seekableValid && durationClose,
      fileSize: blob.size,
      duration,
      seekableEnd: seekable,
      nonZeroSize,
      readableDuration,
      seekableValid,
      durationClose
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
    media.removeAttribute("src");
    media.load();
  }
}
