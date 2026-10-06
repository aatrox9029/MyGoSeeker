const RELEASES_PAGE_URL = "";

export function createSetupReleaseController({
  ensureNativePort,
  isNativeHostConnected
}) {
  async function getSetupState(forceRefresh = false) {
    if (isNativeHostConnected()) {
      return {
        nativeHostInstalled: true,
        showDownload: false,
        reason: "",
        releasesPageUrl: RELEASES_PAGE_URL
      };
    }

    try {
      await ensureNativePort(forceRefresh);
      return {
        nativeHostInstalled: true,
        showDownload: false,
        reason: "",
        releasesPageUrl: RELEASES_PAGE_URL
      };
    } catch (error) {
      return {
        nativeHostInstalled: false,
        showDownload: false,
        reason: error instanceof Error ? error.message : String(error),
        releasesPageUrl: RELEASES_PAGE_URL
      };
    }
  }

  return {
    getSetupState
  };
}

export {
  RELEASES_PAGE_URL
};
