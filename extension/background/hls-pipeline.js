import { createRetryFetchLogger, downloadMediaPlaylistResources } from "../../core/hls/download-segments.js";
import { fetchPlaylist } from "../../core/hls/fetch-playlist.js";
import { parseMasterPlaylist as parseMasterPlaylistModule, choosePreferredMasterOption as choosePreferredMasterOptionModule, chooseAudioTrack } from "../../core/hls/parse-master.js";
import { parseMediaPlaylist as parseMediaPlaylistModule } from "../../core/hls/parse-media.js";
import { addDebugEntry, finalizeDebugLog, setDebugSummary } from "../../core/debug/media-debug-log.js";
import { buildDebugReport } from "../../core/debug/export-debug-report.js";
import { createSegmentCheckpoint, MAX_SEGMENT_BYTES } from "../../core/hls/segment-checkpoint.js";
import { checkEstimatedStreamSize } from "../../core/downloads/stream-size.js";

export function createHlsDownloader({ createCardDebugLog, getCardDebugLog, setCardStatus, buildFileName, activeDownloads }) {
  const finalize = createStreamFinalizer({ setCardStatus, buildFileName, activeDownloads });
  return async function downloadM3u8Variant(card, variant, signal) {
  const debugLog = getCardDebugLog(card) || createCardDebugLog(card, variant);
  const logFetch = createRetryFetchLogger(debugLog, addDebugEntry);
  const checkpoint = await createSegmentCheckpoint(card.id, variant.id, signal);
  const fetchOptions = { signal, logger: logFetch, credentials: card.requestCredentials || "include" };
  const rate = createTransferRateTracker();

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
      ...fetchOptions,
      logger: logFetch,
      stage: "playlist fetch",
      retries: 3
    });
    const masterText = initialPlaylist.text;
    addDebugEntry(debugLog, "info", "playlist", "Fetched initial HLS playlist", {
      url: variant.url,
      isMaster: /^#EXT-X-STREAM-INF/im.test(masterText)
    });

    let videoPlaylistUrl = initialPlaylist.url;
    let videoPlaylistText = masterText;
    let audioPlaylistUrl = variant.audioUrl || "";
    let audioPlaylistText = "";
    let selectedMasterOption = null;
    let codecs = variant.codecs || "";
    const selectedLanguage = card.streamOptions?.audioLanguage;
    if (selectedLanguage && variant.audioTracks?.length) {
      const selectedTrack = variant.audioTracks.find((track) => track.language === selectedLanguage || track.uri === selectedLanguage);
      if (!selectedTrack) throw new Error("Selected audio language is unavailable; rescan");
      audioPlaylistUrl = selectedTrack.uri || "";
    }

    if (/^#EXT-X-STREAM-INF/im.test(masterText)) {
      const options = parseMasterPlaylistModule(masterText, initialPlaylist.url);
      if (options.length === 0) {
        throw new Error("Invalid master m3u8 playlist");
      }
      selectedMasterOption = choosePreferredMasterOptionModule(options);
      if (!selectedMasterOption) {
        throw new Error("Unable to choose HLS stream");
      }

      codecs = selectedMasterOption.codecs;
      const audioTrack = selectedLanguage ? selectedMasterOption.audioTracks.find((track) => track.language === selectedLanguage || track.uri === selectedLanguage) : chooseAudioTrack(selectedMasterOption.audioTracks);
      if (selectedLanguage && !audioTrack) throw new Error("Selected audio language is unavailable; rescan");
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
        ...fetchOptions,
        logger: logFetch,
        stage: "video playlist fetch",
        retries: 3
      });
      videoPlaylistText = videoPlaylist.text;
      videoPlaylistUrl = videoPlaylist.url;
      if (audioPlaylistUrl) {
        const audioPlaylist = await fetchPlaylist(audioPlaylistUrl, {
          ...fetchOptions,
          logger: logFetch,
          stage: "audio playlist fetch",
          retries: 3
        });
        audioPlaylistText = audioPlaylist.text;
        audioPlaylistUrl = audioPlaylist.url;
      }
    }

    if (audioPlaylistUrl && !audioPlaylistText) {
      const audioPlaylist = await fetchPlaylist(audioPlaylistUrl, { ...fetchOptions, stage: "audio playlist fetch" });
      audioPlaylistText = audioPlaylist.text;
      audioPlaylistUrl = audioPlaylist.url;
    }
    if (card.streamOptions?.audioOnly && audioPlaylistText) { videoPlaylistText = audioPlaylistText; videoPlaylistUrl = audioPlaylistUrl; audioPlaylistText = ""; audioPlaylistUrl = ""; codecs = codecs.split(",").filter((codec) => /mp4a|aac|ac-3|ec-3|opus|vorbis|flac|alac/.test(codec)).join(","); }
    let videoPlaylistInfo = parseMediaPlaylistModule(videoPlaylistText, videoPlaylistUrl);
    let audioPlaylistInfo = audioPlaylistText ? parseMediaPlaylistModule(audioPlaylistText, audioPlaylistUrl) : null;
    addDebugEntry(debugLog, "info", "hls-decrypt", "HLS encryption analysis", {
      videoEncrypted: videoPlaylistInfo.encrypted, audioEncrypted: Boolean(audioPlaylistInfo?.encrypted),
      videoEncryptedSegments: videoPlaylistInfo.segments.filter((item) => item.encryption).length,
      audioEncryptedSegments: audioPlaylistInfo?.segments.filter((item) => item.encryption).length || 0
    });
    let capturedVideo, capturedAudio;
    if (!videoPlaylistInfo.isEndList || (audioPlaylistInfo && !audioPlaylistInfo.isEndList)) {
      if (!card.streamOptions?.liveSeconds) throw new Error("Live HLS has no completed playlist; use Record or select a completed video.");
      // New clip on resume: an old sliding window cannot be restored reliably.
      await clearSegmentCheckpoint(card.id);
      [capturedVideo, capturedAudio] = await Promise.all([
        captureLivePlaylist(videoPlaylistUrl, videoPlaylistText, card.streamOptions.liveSeconds, { ...fetchOptions, checkpoint, maxBytes: MAX_SEGMENT_BYTES, stagePrefix: "video", onProgress: (done, total) => setCardStatus(card.id, { progress: 22 + done / total * 40, stage: `Saving live HLS ${Math.round(done)}/${total}s` }).catch(console.error) }),
        audioPlaylistInfo ? captureLivePlaylist(audioPlaylistUrl, audioPlaylistText, card.streamOptions.liveSeconds, { ...fetchOptions, checkpoint, maxBytes: MAX_SEGMENT_BYTES, stagePrefix: "audio" }) : null
      ]);
      videoPlaylistText = capturedVideo.text; videoPlaylistInfo = capturedVideo.info;
      if (capturedAudio) { audioPlaylistText = capturedAudio.text; audioPlaylistInfo = capturedAudio.info; }
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

    checkEstimatedStreamSize((selectedMasterOption?.bandwidth || 0) * videoPlaylistInfo.totalDuration / 8, logFetch);
    const videoResources = capturedVideo?.resources || await downloadMediaPlaylistResources(videoPlaylistInfo, {
      ...fetchOptions, checkpoint, maxBytes: MAX_SEGMENT_BYTES,
      logger: logFetch,
      stagePrefix: "video",
      retries: 3,
      onProgress: (done, total) => {
        if (done % 10 === 0 || done === total) setCardStatus(card.id, {
          ...rate(checkpoint.totalBytes, done, total),
          progress: 22 + done / total * (audioPlaylistInfo ? 25 : 43), stage: `Downloading video segments ${done}/${total}`
        }).catch(console.error);
      }
    });
    const audioResources = audioPlaylistInfo
      ? capturedAudio?.resources || await downloadMediaPlaylistResources(audioPlaylistInfo, {
          ...fetchOptions, checkpoint, maxBytes: MAX_SEGMENT_BYTES,
          logger: logFetch,
          stagePrefix: "audio",
          retries: 3
        })
      : [];

    await finalize({ card, variant, video: { text: videoPlaylistText, info: videoPlaylistInfo, resources: videoResources },
      audio: audioPlaylistInfo ? { text: audioPlaylistText, info: audioPlaylistInfo, resources: audioResources } : null, codecs, debugLog, signal });

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

import { createStreamFinalizer } from "./finalize-stream.js";
import { captureLivePlaylist } from "../../core/hls/capture-live.js";
import { clearSegmentCheckpoint } from "../../core/hls/segment-checkpoint.js";

import { createTransferRateTracker } from "../../core/downloads/transfer-rate.js";
