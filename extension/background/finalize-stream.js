import { buildRemuxJob } from "../../core/hls/merge-renditions.js";
import { chooseOutputFormat } from "../../core/remux/output-format.js";
import { remuxHlsInOffscreen } from "../../core/remux/offscreen-client.js";
import { saveRemuxDownload, releaseRemuxUrl } from "../../core/files/save-remux.js";
import { addDebugEntry, finalizeDebugLog } from "../../core/debug/media-debug-log.js";
import { buildDebugReport } from "../../core/debug/export-debug-report.js";
import { throwIfAborted } from "../../core/tasks/operation-control.js";
export function createStreamFinalizer({ setCardStatus, buildFileName, activeDownloads }) {
  return async function finalizeStream({ card, variant, video, audio, codecs, debugLog, signal }) {
    const audioOnly = Boolean(card.streamOptions?.audioOnly);
    const format = chooseOutputFormat(codecs || variant.codecs, audioOnly);
    const filename = buildFileName(card, variant, format.extension);
    const job = buildRemuxJob({ videoPlaylistText: video.text, videoPlaylistInfo: video.info, videoResources: video.resources,
      audioPlaylistText: audio?.text, audioPlaylistInfo: audio?.info, audioResources: audio?.resources, outputFileName: filename });
    job.outputFormat = format; job.audioOnly = audioOnly;
    job.expectedTracks = { video: !audioOnly && !(/^(?:mp4a|opus|vorbis|aac)/i.test(video.info.codecs || codecs || "") && !audio), audio: audioOnly || Boolean(audio) || /mp4a|aac|opus|vorbis|ac-3|ec-3/i.test(codecs || "") };
    job.outputFileName = `${job.jobPrefix}-output.${format.extension}`;
    if (variant.type === "mpd") {
      job.video.inputFileName = `${job.jobPrefix}-video.${/vp0?[89]|opus|vorbis/i.test(video.info.codecs) ? "webm" : "mp4"}`;
      if (job.audio) job.audio.inputFileName = `${job.jobPrefix}-audio.${/opus|vorbis/i.test(audio.info.codecs) ? "webm" : "mp4"}`;
      for (const kind of ["video", "audio"]) if (job[kind]) {
        const source = kind === "video" ? video : audio;
        let offset = 0;
        job[kind].parts = source.parts.map((part, index) => {
          const resources = job[kind].resources.slice(offset, offset + part.resources.length); offset += part.resources.length;
          return { inputFileName: `${job.jobPrefix}-${kind}-period-${index}.${/webm$/.test(job[kind].inputFileName) ? "webm" : "mp4"}`, resources };
        });
        if (source.parts.length > 1) job[kind].concatFileName = `${job.jobPrefix}-${kind}-concat.txt`;
        if (!/webm$/.test(job[kind].inputFileName) && job[kind].parts.every((part) => part.resources.some((item) => item.kind === "init"))) {
          job[kind].fragmentedPlaylists = job[kind].parts.map((part, index) => ({ resources: part.resources, playlistFileName: `${job.jobPrefix}-${kind}-period-${index}.m3u8` }));
          if (source.parts.length === 1) { delete job[kind].inputFileName; job[kind].playlistFileName = job[kind].fragmentedPlaylists[0].playlistFileName; }
        }
      }
    }
    job.cardId = card.id; job.expectedDuration = Math.max(video.info.totalDuration || 0, audio?.info.totalDuration || 0);
    addDebugEntry(debugLog, "info", "remux", "Selected output container", { format, codecs, audioOnly, resources: video.resources.length + (audio?.resources.length || 0) });
    await setCardStatus(card.id, { status: "downloading", progress: 68, stage: `Remuxing ${format.extension.toUpperCase()}`, error: "" });
    let result;
    for (let attempt = 1; attempt <= 2; attempt++) {
      throwIfAborted(signal);
      try { result = await remuxHlsInOffscreen(job, { signal }); break; }
      catch (error) { throwIfAborted(signal); addDebugEntry(debugLog, "warn", "remux", "Remux attempt failed", { attempt, error: error.message }); if (attempt === 2) throw error; }
    }
    if (!result?.validation?.ok) throw new Error("Finalized media validation failed");
    addDebugEntry(debugLog, "info", "validation", "Finalized media validated", result.validation);
    addDebugEntry(debugLog, "info", "remux", "FFmpeg output", { lines: result.diagnostics });
    let downloadId;
    try { throwIfAborted(signal); downloadId = await saveRemuxDownload(chrome.downloads, result, filename); }
    catch (error) { await releaseRemuxUrl(result.objectUrl); throw error; }
    const mode = variant.type === "mpd" ? "remuxed-dash" : audioOnly ? "remuxed-audio" : audio ? "remuxed-source-av" : "remuxed-source";
    activeDownloads.set(downloadId, { cardId: card.id, variantId: variant.id, totalBytes: 0, objectUrl: result.objectUrl, downloadMode: mode, attemptQueue: [variant.id], attemptIndex: 0 });
    await setCardStatus(card.id, { status: "downloading", progress: 95, stage: `Saving finalized ${format.extension.toUpperCase()}`, downloadMode: mode,
      activeDownloadId: downloadId, activeObjectUrl: result.objectUrl, error: "", lastValidation: result.validation,
      debugReport: buildDebugReport({ card, log: finalizeDebugLog(debugLog, "saving", { fileName: filename, validation: result.validation, outputContainer: result.container, saveMode: "browser-download" }) }) });
  };
}
