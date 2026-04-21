const RELEASES_PAGE_URL = "https://github.com/aatrox9029/MyGoSeeker/releases";

export function createSetupReleaseController({
  ensureNativePort,
  isNativeHostConnected
}) {
  async function getSetupState() {
    if (isNativeHostConnected()) {
      return {
        nativeHostInstalled: true,
        showDownload: false,
        reason: "",
        releasesPageUrl: RELEASES_PAGE_URL
      };
    }

    try {
      await ensureNativePort();
      return {
        nativeHostInstalled: true,
        showDownload: false,
        reason: "",
        releasesPageUrl: RELEASES_PAGE_URL
      };
    } catch (error) {
      return {
        nativeHostInstalled: false,
        showDownload: true,
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
