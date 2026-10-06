export function createNativePortMessageHandler({
  EVENT_TYPES,
  getStateCards,
  findCardByNativeJobId,
  setCardStatus,
  requestNativeReport,
  fallbackNativeDownload
}) {
  return async function handleNativePortMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "NATIVE_HOST_DISCONNECTED") {
      const affectedCards = getStateCards().filter((card) => card.nativeJobId && card.status === "downloading");
      for (const card of affectedCards) {
        if (fallbackNativeDownload) {
          await fallbackNativeDownload(card, message);
          continue;
        }
        await setCardStatus(card.id, {
          status: "error",
          stage: "Native host disconnected",
          error: message.error || "Native host disconnected",
          activeDownloadId: 0
        });
      }
      return;
    }

    const card = findCardByNativeJobId(message.jobId);
    if (!card && message.type !== EVENT_TYPES.READY && message.type !== EVENT_TYPES.PONG) {
      return;
    }

    switch (message.type) {
      case EVENT_TYPES.READY:
        return;
      case EVENT_TYPES.JOB_ACCEPTED:
        await setCardStatus(card.id, {
          status: "downloading",
          progress: 5,
          stage: "Native job accepted",
          activeDownloadId: 0,
          error: ""
        });
        return;
      case EVENT_TYPES.JOB_STAGE:
        await setCardStatus(card.id, {
          status: "downloading",
          progress: Number.isFinite(message.percent) ? message.percent : card.progress,
          stage: typeof message.stage === "string" ? message.stage : card.stage,
          error: ""
        });
        return;
      case EVENT_TYPES.JOB_PROGRESS:
        await setCardStatus(card.id, {
          status: "downloading",
          progress: Number.isFinite(message.percent) ? message.percent : card.progress,
          stage: typeof message.stage === "string" ? message.stage : "Native downloading",
          error: ""
        });
        return;
      case EVENT_TYPES.JOB_COMPLETED:
        await setCardStatus(card.id, {
          status: "completed",
          progress: 100,
          stage: "Completed",
          activeDownloadId: 0,
          error: "",
          lastValidation: message.validation && typeof message.validation === "object" ? message.validation : null,
          completedAt: Date.now()
        });
        await requestNativeReport(message.jobId);
        return;
      case EVENT_TYPES.JOB_REPORT_READY:
        if (typeof message.reportBody === "string" && message.reportBody) {
          await setCardStatus(card.id, {
            debugReport: message.reportBody
          });
        }
        return;
      case EVENT_TYPES.JOB_WARNING:
        await setCardStatus(card.id, {
          stage: typeof message.message === "string" ? message.message : card.stage
        });
        return;
      case EVENT_TYPES.JOB_FAILED:
        if (fallbackNativeDownload) {
          await fallbackNativeDownload(card, message);
          return;
        }
        await setCardStatus(card.id, {
          status: "error",
          stage: typeof message.stage === "string" ? message.stage : "Native job failed",
          error: message.message || "Native job failed",
          activeDownloadId: 0
        });
        await requestNativeReport(message.jobId);
        return;
      default:
        return;
    }
  };
}
