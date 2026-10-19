const RELEASES_PAGE_URL = "https://github.com/aatrox9029/MyGoSeeker/releases";

export function createSetupReleaseController({
  ensureNativePort,
  isNativeHostConnected,
  isEnabled = () => true
}) {
  async function getSetupState(forceRefresh = false) {
    if (!isEnabled()) return { nativeHostInstalled: false, nativeHelperBundled: true, nativeHelperEnabled: false,
      showDownload: false, reason: "", releasesPageUrl: RELEASES_PAGE_URL };
    if (isNativeHostConnected()) {
      return {
        nativeHostInstalled: true,
        nativeHelperBundled: true,
        showDownload: false,
        reason: "",
        releasesPageUrl: RELEASES_PAGE_URL
      };
    }

    try {
      await ensureNativePort(forceRefresh);
      return {
        nativeHostInstalled: true,
        nativeHelperBundled: true,
        showDownload: false,
        reason: "",
        releasesPageUrl: RELEASES_PAGE_URL
      };
    } catch (error) {
      return {
        nativeHostInstalled: false,
        nativeHelperBundled: true,
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
