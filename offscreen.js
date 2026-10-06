import { FFmpeg } from "./vendor/ffmpeg/ffmpeg/index.js";
import { detectContainerSignature, validateFinalizedMediaBlob } from "./core/remux/finalize-media.js";
import { getBinaryJob, putBinaryJob } from "./core/files/binary-store.js";

const ffmpeg = new FFmpeg();
let ffmpegLoaded = false;
let remuxQueue = Promise.resolve();
const outputUrls = new Set();
let ffmpegLog = [];
ffmpeg.on("log", ({ message }) => {
  ffmpegLog.push(message);
  if (ffmpegLog.length > 100) ffmpegLog.shift();
});

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
  ffmpegLog = [];
  await ensureLoaded();

  try {
    await writeJobFiles(job);
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

    const exitCode = await ffmpeg.exec(args, 120000);
    if (exitCode !== 0) throw new Error(`FFmpeg remux failed (exit ${exitCode})`);
    const data = await ffmpeg.readFile(job.outputFileName);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const blob = new Blob([arrayBuffer], { type: "video/mp4" });
    const validation = await validateFinalizedMediaBlob(blob, job.expectedDuration || 0);
    const container = detectContainerSignature(arrayBuffer);
    validation.container = container;
    validation.containerValid = container === "mp4";
    validation.ok = validation.ok && validation.containerValid;
    if (!validation.ok) throw new Error("Finalized media validation failed");
    const objectUrl = URL.createObjectURL(blob);
    outputUrls.add(objectUrl);
    return {
      ok: true,
      mimeType: "video/mp4",
      outputFileName: job.outputFileName,
      objectUrl,
      validation,
      diagnostics: [...ffmpegLog],
      container
    };
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${ffmpegLog.slice(-20).join("\n")}`);
  } finally {
    await cleanupJobFiles(job);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OFFSCREEN_RELEASE_URL") {
    if (outputUrls.delete(message.objectUrl)) URL.revokeObjectURL(message.objectUrl);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type !== "OFFSCREEN_REMUX_HLS") {
    return false;
  }

  const operation = remuxQueue.then(async () => {
    const job = await getBinaryJob(message.jobKey);
    if (!job) throw new Error("Remux job not found");
    const result = await handleRemux(job);
    try { await putBinaryJob(`${message.jobKey}:result`, result); }
    catch (error) {
      outputUrls.delete(result.objectUrl);
      URL.revokeObjectURL(result.objectUrl);
      throw error;
    }
    return { ok: true };
  });
  remuxQueue = operation.catch(() => {});
  operation.then((result) => sendResponse(result))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});
