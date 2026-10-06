function getRecorderConfig(hasAudioTrack) {
  const candidates = hasAudioTrack
    ? [
      { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
      { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
      { mime: "video/webm", ext: "webm" },
      { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
      { mime: "video/mp4", ext: "mp4" },
      { mime: "video/quicktime", ext: "mov" }
    ]
    : [
      { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
      { mime: "video/mp4", ext: "mp4" },
      { mime: "video/webm", ext: "webm" },
      { mime: "video/quicktime", ext: "mov" }
    ];

  for (const item of candidates) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(item.mime)) {
      return item;
    }
  }

  return { mime: "", ext: hasAudioTrack ? "webm" : "mp4" };
}

function getVideoCaptureStream(video) {
  if (typeof video.captureStream === "function") {
    return video.captureStream();
  }
  if (typeof video.mozCaptureStream === "function") {
    return video.mozCaptureStream();
  }
  throw new Error("captureStream is not supported on this page");
}

async function buildRecordingStream(video) {
  const stream = getVideoCaptureStream(video);
  return { stream, hasAudioTrack: stream.getAudioTracks().length > 0, cleanup: () => {} };
}

async function recordFromVideoElement(video, fileBase, cardId) {
  if (!video) {
    throw new Error("No playable video element for captureStream fallback");
  }

  const originalMuted = Boolean(video.muted);
  const originalVolume = Number.isFinite(video.volume) ? video.volume : 1;
  video.muted = false;
  if (video.volume === 0) {
    video.volume = 1;
  }

  let recordingStream;
  try { recordingStream = await buildRecordingStream(video); }
  catch (error) { video.muted = originalMuted; video.volume = originalVolume; throw error; }
  const stream = recordingStream.stream;
  const config = getRecorderConfig(recordingStream.hasAudioTrack);
  let recorder;
  try { recorder = config.mime ? new MediaRecorder(stream, { mimeType: config.mime }) : new MediaRecorder(stream); }
  catch (error) {
    video.muted = originalMuted; video.volume = originalVolume;
    recordingStream.cleanup();
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  const chunks = [];

  const durationInfo = resolveEffectiveDuration(video);
  const duration = durationInfo.duration;
  const startTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

  await sendBlobProgress(cardId, {
    status: "downloading",
    progress: 18,
    stage: recordingStream.hasAudioTrack
      ? (durationInfo.usedFallback ? "Recording with fallback duration estimate" : "Recording with captureStream fallback")
      : "Recording fallback (audio track unavailable)",
    mode: "recorded-fallback"
  });

  return new Promise((resolve, reject) => {
    let finished = false;
    let progressInterval = null;
    let timeoutId = null;
    let inactivityTimer = null;
    let waitingForPlayback = true;
    let inactivityReason = "playback";

    const clearStopTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = null;
    };

    const scheduleStopTimer = () => {
      clearStopTimer();
      if (video.ended) {
        return;
      }
      const remaining = duration > 0
        ? Math.max(duration - (Number.isFinite(video.currentTime) ? video.currentTime : startTime), 0)
        : 0;
      const maxMs = duration > 0
        ? Math.min(Math.max(remaining * 2000 + 15000, 60000), 30 * 60 * 1000)
        : 10 * 60 * 1000;
      timeoutId = setTimeout(() => {
        if (recorder.state === "recording" || recorder.state === "paused") {
          finish(new Error("Recording timed out before playback ended"));
        }
      }, maxMs);
    };

    const updateRecorderForPlaybackState = (reason = "playback") => {
      inactivityReason = reason;
      if (finished) {
        return;
      }
      clearTimeout(inactivityTimer);
      const activelyPlaying = !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      if (activelyPlaying) {
        waitingForPlayback = false;
        if (recorder.state === "paused") {
          recorder.resume();
        }
        scheduleStopTimer();
        return;
      }
      clearStopTimer();
      inactivityTimer = setTimeout(() => finish(new Error("Recording stopped: playback inactive for two minutes")), 120000);
      if (recorder.state === "recording") {
        recorder.pause();
      }
    };

    const finish = (error) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(inactivityTimer);
      if (recorder.state !== "inactive") { try { recorder.stop(); } catch {} }
      clearInterval(progressInterval);
      clearStopTimer();
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("play", onPlayStateChange);
      video.removeEventListener("playing", onPlayStateChange);
      video.removeEventListener("pause", onPauseStateChange);
      video.removeEventListener("waiting", onWaitingStateChange);
      video.removeEventListener("stalled", onWaitingStateChange);
      video.removeEventListener("seeking", onWaitingStateChange);
      video.removeEventListener("seeked", onPlayStateChange);
      video.muted = originalMuted;
      video.volume = originalVolume;
      recordingStream.cleanup();
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore stop failure.
        }
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const onEnded = () => {
      if (recorder.state === "recording") {
        recorder.stop();
      }
      if (recorder.state === "paused") {
        recorder.resume();
        recorder.stop();
      }
    };

    const onPlayStateChange = () => {
      updateRecorderForPlaybackState("playback");
    };

    const onPauseStateChange = () => {
      updateRecorderForPlaybackState("paused");
    };

    const onWaitingStateChange = () => {
      updateRecorderForPlaybackState("buffering");
    };

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      finish(new Error(event.error?.message || "MediaRecorder error"));
    };

    recorder.onstop = async () => {
      if (finished) return;
      try {
        const mimeType = recorder.mimeType || config.mime || "video/webm";
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size === 0) {
          throw new Error("Recorded file is empty");
        }
        const validation = await validateVideoBlob(blob, {
          allowMetadataFailure: true,
          minSize: 32 * 1024
        });

        const ext = getExtFromMime(mimeType) || config.ext;
        const filename = `${fileBase}.${ext}`;
        await saveBlobToFile(blob, filename);

        await sendBlobProgress(cardId, {
          status: "completed",
          progress: 100,
          stage: validation.metadataDeferred
            ? `Recorded as ${ext.toUpperCase()} (metadata deferred, last resort)`
            : `Recorded as ${ext.toUpperCase()} (last resort)`,
          mode: "recorded-fallback"
        });

        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };

    video.addEventListener("ended", onEnded);
    video.addEventListener("play", onPlayStateChange);
    video.addEventListener("playing", onPlayStateChange);
    video.addEventListener("pause", onPauseStateChange);
    video.addEventListener("waiting", onWaitingStateChange);
    video.addEventListener("stalled", onWaitingStateChange);
    video.addEventListener("seeking", onWaitingStateChange);
    video.addEventListener("seeked", onPlayStateChange);

    progressInterval = setInterval(() => {
      if (duration > 0) {
        const remainingDuration = Math.max(duration - startTime, 0.001);
        const ratio = clamp((video.currentTime - startTime) / remainingDuration, 0, 1);
        const progress = 20 + ratio * 75;
        sendBlobProgress(cardId, {
          status: "downloading",
          progress,
          stage: waitingForPlayback
            ? "Waiting for video playback before recording"
            : inactivityReason === "paused"
              ? "Recording paused with video"
              : inactivityReason === "buffering"
                ? "Recording paused while video buffers"
                : durationInfo.usedFallback
                  ? "Recording stream (fallback duration)"
                  : "Recording stream",
          mode: "recorded-fallback"
        });
      }
    }, 500);

    Promise.resolve(video.play())
      .catch(() => {
        // Ignore play failure and still attempt recording current playback state.
      })
      .finally(() => {
        try {
          recorder.start(1000);
          updateRecorderForPlaybackState("playback");
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      });
  });
}

