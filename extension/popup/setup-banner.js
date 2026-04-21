const DEFAULT_TEXT = {
  unavailable: "Native helper is unavailable on this PC.",
  download: "Open setup page",
  checking: "Checking native helper status...",
  checkingButton: "Checking...",
  refresh: "Refresh",
  downloading: "Opening releases page...",
  ready: "Open the official GitHub releases page to get setup.exe.",
  missing: "Open the official GitHub releases page to get setup.exe.",
  error: "Unable to check native helper availability."
};

function getText(messages, path, fallback) {
  return path.split(".").reduce((value, key) => value?.[key], messages) || fallback;
}

export function createSetupBannerController({
  container,
  messageNode,
  downloadButton,
  refreshButton,
  requestState,
  openSetupPage,
  getMessages
}) {
  let currentState = {
    status: "idle",
    nativeHostInstalled: false,
    showDownload: false,
    reason: "",
    releasesPageUrl: ""
  };

  function render() {
    const messages = getMessages();
    const unavailableText = getText(messages, "popup.setup.unavailable", DEFAULT_TEXT.unavailable);
    const downloadText = getText(messages, "popup.setup.download", DEFAULT_TEXT.download);
    const checkingText = getText(messages, "popup.setup.checking", DEFAULT_TEXT.checking);
    const checkingButtonText = getText(messages, "popup.setup.checkingButton", DEFAULT_TEXT.checkingButton);
    const refreshText = getText(messages, "popup.setup.refresh", DEFAULT_TEXT.refresh);
    const downloadingText = getText(messages, "popup.setup.downloading", DEFAULT_TEXT.downloading);
    const readyText = getText(messages, "popup.setup.ready", DEFAULT_TEXT.ready);
    const missingText = getText(messages, "popup.setup.missing", DEFAULT_TEXT.missing);
    const errorText = getText(messages, "popup.setup.error", DEFAULT_TEXT.error);

    refreshButton.textContent = refreshText;

    if (currentState.nativeHostInstalled) {
      container.hidden = true;
      return;
    }

    container.hidden = false;
    downloadButton.hidden = false;
    downloadButton.textContent = currentState.status === "loading" ? checkingButtonText : downloadText;
    downloadButton.disabled = currentState.status === "loading"
      || currentState.status === "downloading"
      || !currentState.showDownload;
    refreshButton.disabled = currentState.status === "loading" || currentState.status === "downloading";

    if (currentState.status === "loading") {
      messageNode.textContent = checkingText;
      return;
    }

    if (currentState.status === "downloading") {
      messageNode.textContent = downloadingText;
      return;
    }

    if (currentState.status === "error") {
      messageNode.textContent = `${unavailableText} ${currentState.reason || errorText}`.trim();
      return;
    }

    if (currentState.showDownload) {
      messageNode.textContent = `${unavailableText} ${readyText}`.trim();
      return;
    }

    messageNode.textContent = `${unavailableText} ${currentState.reason || missingText}`.trim();
  }

  async function refresh(forceRefresh = false) {
    currentState = {
      ...currentState,
      status: "loading"
    };
    render();
    try {
      const response = await requestState(forceRefresh);
      currentState = {
        status: "ready",
        ...(response?.data || {})
      };
    } catch (error) {
      currentState = {
        status: "error",
        nativeHostInstalled: false,
        showDownload: false,
        reason: error instanceof Error ? error.message : String(error),
        releasesPageUrl: ""
      };
    }
    render();
    return currentState;
  }

  async function startDownload() {
    currentState = {
      ...currentState,
      status: "downloading"
    };
    render();
    try {
      await openSetupPage(currentState.releasesPageUrl);
      currentState = {
        ...currentState,
        status: "ready"
      };
      render();
    } catch (error) {
      currentState = {
        ...currentState,
        status: "error",
        reason: error instanceof Error ? error.message : String(error)
      };
      render();
    }
  }

  refreshButton.addEventListener("click", () => {
    refresh(true).catch(() => {});
  });
  downloadButton.addEventListener("click", () => {
    startDownload().catch(() => {});
  });

  return {
    refresh,
    render
  };
}
