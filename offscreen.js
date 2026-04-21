import { FFmpeg } from "./vendor/ffmpeg/ffmpeg/index.js";
import { detectContainerSignature, validateFinalizedMediaBlob } from "./core/remux/finalize-media.js";

const ffmpeg = new FFmpeg();
let ffmpegLoaded = false;

async function ensureLoaded() {
  if (ffmpegLoaded) {
    return;
  }
  await ffmpeg.load({
    coreURL: chrome.runtime.getURL("vendor/ffmpeg/core/ffmpeg-core.js"),
    wasmURL: chrome.runtime.getURL("vendor/ffmpeg/core/ffmpeg-core.wasm")
  });
  ffmpegLoaded = true;
}

async function writeJobFiles(job) {
  await cleanupJobFiles(job);
  await ffmpeg.writeFile(job.video.playlistFileName, new TextEncoder().encode(job.video.playlistText));
  for (const resource of job.video.resources) {
    await ffmpeg.writeFile(resource.fileName, new Uint8Array(resource.bytes));
  }

  if (job.audio) {
    await ffmpeg.writeFile(job.audio.playlistFileName, new TextEncoder().encode(job.audio.playlistText));
    for (const resource of job.audio.resources) {
      await ffmpeg.writeFile(resource.fileName, new Uint8Array(resource.bytes));
    }
  }
}

async function cleanupJobFiles(job) {
  const fileNames = [
    job.video.playlistFileName,
    ...job.video.resources.map((item) => item.fileName),
    job.audio?.playlistFileName,
    ...(job.audio?.resources || []).map((item) => item.fileName),
    job.outputFileName
  ].filter(Boolean);

  for (const fileName of fileNames) {
    try {
      await ffmpeg.deleteFile(fileName);
    } catch {
      // Ignore cleanup failure.
    }
  }
}

async function handleRemux(job) {
  await ensureLoaded();
  await writeJobFiles(job);

  try {
    const args = job.audio
      ? [
          "-y",
          "-protocol_whitelist", "file,pipe,data",
          "-i", job.video.playlistFileName,
          "-protocol_whitelist", "file,pipe,data",
          "-i", job.audio.playlistFileName,
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-c", "copy",
          "-movflags", "+faststart",
          job.outputFileName
        ]
      : [
          "-y",
          "-protocol_whitelist", "file,pipe,data",
          "-i", job.video.playlistFileName,
          "-c", "copy",
          "-movflags", "+faststart",
          job.outputFileName
        ];

    await ffmpeg.exec(args);
    const data = await ffmpeg.readFile(job.outputFileName);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const blob = new Blob([arrayBuffer], { type: "video/mp4" });
    const validation = await validateFinalizedMediaBlob(blob, job.expectedDuration || 0);
    const container = detectContainerSignature(arrayBuffer);
    validation.container = container;
    validation.containerValid = container === "mp4";
    validation.ok = validation.ok && validation.containerValid;
    return {
      ok: true,
      mimeType: "video/mp4",
      outputFileName: job.outputFileName,
      arrayBuffer,
      validation,
      container
    };
  } finally {
    await cleanupJobFiles(job);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "OFFSCREEN_REMUX_HLS") {
    return false;
  }

  handleRemux(message.job)
    .then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});
