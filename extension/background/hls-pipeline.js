import { createRetryFetchLogger, downloadMediaPlaylistResources } from "../../core/hls/download-segments.js";
import { fetchPlaylist } from "../../core/hls/fetch-playlist.js";
import { parseMasterPlaylist as parseMasterPlaylistModule, choosePreferredMasterOption as choosePreferredMasterOptionModule, chooseAudioTrack } from "../../core/hls/parse-master.js";
import { parseMediaPlaylist as parseMediaPlaylistModule } from "../../core/hls/parse-media.js";
import { buildRemuxJob } from "../../core/hls/merge-renditions.js";
import { remuxHlsInOffscreen } from "../../core/remux/offscreen-client.js";
import { saveRemuxDownload, releaseRemuxUrl } from "../../core/files/save-remux.js";
import { addDebugEntry, finalizeDebugLog, setDebugSummary } from "../../core/debug/media-debug-log.js";
import { buildDebugReport } from "../../core/debug/export-debug-report.js";

export function createHlsDownloader({ createCardDebugLog, getCardDebugLog, setCardStatus, buildFileName, activeDownloads }) {
  return async function downloadM3u8Variant(card, variant) {
  const debugLog = getCardDebugLog(card) || createCardDebugLog(card, variant);
  const logFetch = createRetryFetchLogger(debugLog, addDebugEntry);

  await setCardStatus(card.id, {
    status: "downloading",
    progress: 5,
    stage: "Fetching playlist",
    downloadMode: "remuxing-source",
    debugLogId: debugLog.id,
    error: ""
  });

  try {
    const initialPlaylist = await fetchPlaylist(variant.url, {
      logger: logFetch,
      stage: "playlist fetch",
      retries: 3
    });
    const masterText = initialPlaylist.text;
    addDebugEntry(debugLog, "info", "playlist", "Fetched initial HLS playlist", {
      url: variant.url,
      isMaster: /^#EXT-X-STREAM-INF/im.test(masterText)
    });

    if (/^#EXT-X-KEY:(?!.*METHOD=NONE)/im.test(masterText)) {
      throw new Error("Encrypted m3u8 is not supported.");
    }

    let videoPlaylistUrl = initialPlaylist.url;
    let videoPlaylistText = masterText;
    let audioPlaylistUrl = variant.audioUrl || "";
    let audioPlaylistText = "";
    let selectedMasterOption = null;

    if (/^#EXT-X-STREAM-INF/im.test(masterText)) {
      const options = parseMasterPlaylistModule(masterText, initialPlaylist.url);
      if (options.length === 0) {
        throw new Error("Invalid master m3u8 playlist");
      }
      selectedMasterOption = choosePreferredMasterOptionModule(options);
      if (!selectedMasterOption) {
        throw new Error("Unable to choose HLS stream");
      }

      const audioTrack = chooseAudioTrack(selectedMasterOption.audioTracks);
      videoPlaylistUrl = selectedMasterOption.url;
      audioPlaylistUrl = audioTrack?.uri || "";

      addDebugEntry(debugLog, "info", "playlist", "Selected master variant", {
        resolution: selectedMasterOption.resolutionHeight || 0,
        codecs: selectedMasterOption.codecs,
        audioGroup: selectedMasterOption.audioGroupId || "",
        hasSeparateAudio: selectedMasterOption.hasSeparateAudio,
        audioTrack: audioTrack?.language || audioTrack?.name || ""
      });

      await setCardStatus(card.id, {
        status: "downloading",
        progress: 12,
        stage: selectedMasterOption.hasSeparateAudio
          ? "Selected split audio/video HLS stream"
          : "Selected muxed HLS stream",
        error: ""
      });

      const videoPlaylist = await fetchPlaylist(videoPlaylistUrl, {
        logger: logFetch,
        stage: "video playlist fetch",
        retries: 3
      });
      videoPlaylistText = videoPlaylist.text;
      videoPlaylistUrl = videoPlaylist.url;
      if (audioPlaylistUrl) {
        const audioPlaylist = await fetchPlaylist(audioPlaylistUrl, {
          logger: logFetch,
          stage: "audio playlist fetch",
          retries: 3
        });
        audioPlaylistText = audioPlaylist.text;
        audioPlaylistUrl = audioPlaylist.url;
      }
    }

    if (/^#EXT-X-KEY:(?!.*METHOD=NONE)/im.test(videoPlaylistText) || /^#EXT-X-KEY:(?!.*METHOD=NONE)/im.test(audioPlaylistText)) {
      throw new Error("Encrypted media playlist is not supported.");
    }

    if (audioPlaylistUrl && !audioPlaylistText) {
      const audioPlaylist = await fetchPlaylist(audioPlaylistUrl, { logger: logFetch, stage: "audio playlist fetch" });
      audioPlaylistText = audioPlaylist.text;
      audioPlaylistUrl = audioPlaylist.url;
    }
    const videoPlaylistInfo = parseMediaPlaylistModule(videoPlaylistText, videoPlaylistUrl);
    const audioPlaylistInfo = audioPlaylistText ? parseMediaPlaylistModule(audioPlaylistText, audioPlaylistUrl) : null;
    if (videoPlaylistInfo.encrypted || audioPlaylistInfo?.encrypted) throw new Error("Encrypted media playlist is not supported.");
    if (!videoPlaylistInfo.isEndList || (audioPlaylistInfo && !audioPlaylistInfo.isEndList)) {
      throw new Error("Live HLS is not a complete video. Use Record for playback capture.");
    }
    if (videoPlaylistInfo.segments.length === 0) {
      throw new Error("No media segments found in HLS video playlist");
    }
    if (audioPlaylistInfo && audioPlaylistInfo.segments.length === 0) {
      throw new Error("No media segments found in HLS audio playlist");
    }

    setDebugSummary(debugLog, {
      playlistType: selectedMasterOption ? "master" : "media",
      codecs: selectedMasterOption?.codecs || "",
      videoSegmentExtensions: videoPlaylistInfo.segmentExtensions,
      videoInitSegment: Boolean(videoPlaylistInfo.initSegment),
      audioGroup: selectedMasterOption?.audioGroupId || "",
      hasSeparateAudio: Boolean(audioPlaylistInfo),
      audioSegmentExtensions: audioPlaylistInfo?.segmentExtensions || [],
      audioInitSegment: Boolean(audioPlaylistInfo?.initSegment),
      finalizeMode: "ffmpeg-copy-faststart"
    });

    await setCardStatus(card.id, {
      status: "downloading",
      progress: 22,
      stage: "Downloading HLS segments with retry",
      error: ""
    });

    const videoResources = await downloadMediaPlaylistResources(videoPlaylistInfo, {
      logger: logFetch,
      stagePrefix: "video",
      retries: 3,
      onProgress: (done, total) => {
        if (done % 10 === 0 || done === total) setCardStatus(card.id, {
          progress: 22 + done / total * (audioPlaylistInfo ? 25 : 43), stage: `Downloading video segments ${done}/${total}`
        }).catch(console.error);
      }
    });
    const audioResources = audioPlaylistInfo
      ? await downloadMediaPlaylistResources(audioPlaylistInfo, {
          logger: logFetch,
          stagePrefix: "audio",
          retries: 3
        })
      : [];

    const outputExt = "mp4";
    const filename = buildFileName(card, variant, outputExt);
    const remuxJob = buildRemuxJob({
      videoPlaylistText,
      videoPlaylistInfo,
      videoResources,
      audioPlaylistText,
      audioPlaylistInfo,
      audioResources,
      outputFileName: filename
    });
    remuxJob.expectedDuration = Math.max(videoPlaylistInfo.totalDuration || 0, audioPlaylistInfo?.totalDuration || 0);
    remuxJob.cardId = card.id;

    await setCardStatus(card.id, {
      status: "downloading",
      progress: 68,
      stage: audioPlaylistInfo ? "Remuxing video/audio and moving moov to front" : "Remuxing HLS and moving moov to front",
      error: ""
    });

    let remuxResult = null;
    let remuxError = null;
    for (let remuxAttempt = 1; remuxAttempt <= 2; remuxAttempt += 1) {
      try {
        addDebugEntry(debugLog, "info", "remux", "Starting FFmpeg remux", { remuxAttempt });
        remuxResult = await remuxHlsInOffscreen(remuxJob);
        remuxError = null;
        break;
      } catch (error) {
        remuxError = error instanceof Error ? error : new Error(String(error));
        addDebugEntry(debugLog, "warn", "remux", "Remux attempt failed", {
          remuxAttempt,
          error: remuxError.message
        });
      }
    }
    if (remuxError || !remuxResult) {
      throw remuxError || new Error("Remux failed");
    }
    if (!remuxResult.validation?.ok) {
      throw new Error("Finalized media validation failed");
    }

    addDebugEntry(debugLog, "info", "validation", "Finalized media validated", remuxResult.validation);
    addDebugEntry(debugLog, "info", "remux", "FFmpeg output", { lines: remuxResult.diagnostics });

    let downloadId;
    try { downloadId = await saveRemuxDownload(chrome.downloads, remuxResult, filename); }
    catch (error) { await releaseRemuxUrl(remuxResult.objectUrl); throw error; }
    activeDownloads.set(downloadId, {
      cardId: card.id, variantId: variant.id, totalBytes: 0,
      objectUrl: remuxResult.objectUrl,
      downloadMode: audioPlaylistInfo ? "remuxed-source-av" : "remuxed-source",
      attemptQueue: [variant.id], attemptIndex: 0
    });
    await setCardStatus(card.id, {
      status: "downloading",
      progress: 95,
      stage: "Saving finalized MP4",
      downloadMode: audioPlaylistInfo ? "remuxed-source-av" : "remuxed-source",
      activeDownloadId: downloadId,
      activeObjectUrl: remuxResult.objectUrl,
      error: "",
      lastValidation: remuxResult.validation,
      debugReport: buildDebugReport({
        card,
        log: finalizeDebugLog(debugLog, "saving", {
          fileName: filename,
          validation: remuxResult.validation,
          outputContainer: remuxResult.container,
          saveMode: "browser-download"
        })
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const report = buildDebugReport({
      card,
      log: finalizeDebugLog(debugLog, "failed", {
        error: message
      }),
      extraNotes: [
        "This report can be exported from the popup for failed or degraded downloads."
      ]
    });
    await setCardStatus(card.id, {
      debugReport: report
    });
    throw error;
  }
};
}
