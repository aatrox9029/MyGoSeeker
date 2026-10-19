import { FFmpeg } from "./vendor/ffmpeg/ffmpeg/index.js";
import { detectContainerSignature, validateFinalizedMediaBlob } from "./core/remux/finalize-media.js";
import { getBinaryJob, putBinaryJob } from "./core/files/binary-store.js";
import { readSegmentResource } from "./core/hls/segment-checkpoint.js";
import { validateOutputTracks } from "./core/remux/validate-output-tracks.js";
import { writeDashTrack } from "./core/remux/write-dash-track.js";

const ffmpeg = new FFmpeg();
let ffmpegLoaded = false;
let remuxQueue = Promise.resolve();
const outputUrls = new Set();
const pendingJobs = new Set();
const pendingOperations = new Map();
const cancelledJobs = new Set();
let activeJobKey = "";
function checkCancelled(key) {
  if (cancelledJobs.has(key)) throw new Error("Remux cancelled");
}
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
  if (job.video.inputFileName || job.video.fragmentedPlaylists) {
    await writeDashTrack(ffmpeg, job.video, () => checkCancelled(job.jobPrefix));
    if (job.audio) await writeDashTrack(ffmpeg, job.audio, () => checkCancelled(job.jobPrefix));
    return;
  }
  await ffmpeg.writeFile(job.video.playlistFileName, new TextEncoder().encode(job.video.playlistText));
  for (const resource of job.video.resources) {
    checkCancelled(job.jobPrefix);
    await ffmpeg.writeFile(resource.fileName, new Uint8Array(await readSegmentResource(resource)));
  }

  if (job.audio) {
    await ffmpeg.writeFile(job.audio.playlistFileName, new TextEncoder().encode(job.audio.playlistText));
    for (const resource of job.audio.resources) {
      checkCancelled(job.jobPrefix);
      await ffmpeg.writeFile(resource.fileName, new Uint8Array(await readSegmentResource(resource)));
    }
  }
}

async function cleanupJobFiles(job) {
  const fileNames = [
    job.video.inputFileName,
    job.video.concatFileName,
    ...(job.video.parts || []).map((part) => part.inputFileName),
    ...(job.video.fragmentedPlaylists || []).map((part) => part.playlistFileName),
    job.video.playlistFileName,
    ...job.video.resources.map((item) => item.fileName),
    job.audio?.playlistFileName,
    job.audio?.inputFileName,
    job.audio?.concatFileName,
    ...(job.audio?.parts || []).map((part) => part.inputFileName),
    ...(job.audio?.fragmentedPlaylists || []).map((part) => part.playlistFileName),
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
  checkCancelled(job.jobPrefix);
  await ensureLoaded();

  try {
    await writeJobFiles(job);
    checkCancelled(job.jobPrefix);
    const args = buildRemuxArguments(job);
    ffmpegLog.push(`Local remux arguments: ${JSON.stringify(args)}`);

    const exitCode = await ffmpeg.exec(args, 120000);
    if (exitCode !== 0) throw new Error(`FFmpeg remux failed (exit ${exitCode})`);
    const data = await ffmpeg.readFile(job.outputFileName);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const mimeType = job.outputFormat?.mimeType || "video/mp4";
    const blob = new Blob([arrayBuffer], { type: mimeType });
    const validation = await validateFinalizedMediaBlob(blob, job.expectedDuration || 0);
    checkCancelled(job.jobPrefix);
    const container = detectContainerSignature(arrayBuffer);
    validation.container = container;
    validation.containerValid = container === (job.outputFormat?.container || "mp4");
    if (job.expectedTracks) Object.assign(validation, validateOutputTracks(ffmpegLog, job.expectedTracks));
    validation.ok = validation.ok && validation.containerValid && validation.tracksValid !== false;
    if (!validation.ok) throw new Error("Finalized media validation failed");
    const objectUrl = URL.createObjectURL(blob);
    outputUrls.add(objectUrl);
    return {
      ok: true,
      mimeType,
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
    ffmpeg.terminate(); ffmpegLoaded = false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OFFSCREEN_VALIDATE_DIRECT") {
    (async () => {
      const job = await getBinaryJob(message.jobKey);
      if (!job?.bytes) throw new Error("Direct media data missing");
      const container = detectContainerSignature(job.bytes);
      if (!["mp4", "webm"].includes(container)) throw new Error("Credential-free direct downloads require MP4 or WebM");
      const blob = new Blob([job.bytes], { type: `video/${container}` });
      const validation = await validateFinalizedMediaBlob(blob);
      if (!validation.ok) throw new Error("Direct media validation failed");
      const objectUrl = URL.createObjectURL(blob); outputUrls.add(objectUrl);
      return { objectUrl, validation, container };
    })().then((data) => sendResponse({ ok: true, data })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "OFFSCREEN_CANCEL_REMUX") {
    if (pendingJobs.has(message.jobKey)) cancelledJobs.add(message.jobKey);
    if (activeJobKey === message.jobKey) { ffmpeg.terminate(); ffmpegLoaded = false; }
    Promise.resolve(pendingOperations.get(message.jobKey)).catch(() => {}).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "OFFSCREEN_RELEASE_URL") {
    if (outputUrls.delete(message.objectUrl)) URL.revokeObjectURL(message.objectUrl);
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type !== "OFFSCREEN_REMUX_HLS") {
    return false;
  }

  pendingJobs.add(message.jobKey);
  const operation = remuxQueue.then(async () => {
    activeJobKey = message.jobKey;
    checkCancelled(message.jobKey);
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
  }).finally(() => {
    pendingJobs.delete(message.jobKey);
    pendingOperations.delete(message.jobKey);
    cancelledJobs.delete(message.jobKey);
    if (activeJobKey === message.jobKey) activeJobKey = "";
  });
  pendingOperations.set(message.jobKey, operation);
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

import { buildRemuxArguments } from "./core/remux/build-arguments.js";
