export async function requestBlobDownload(tabId, payload, frameId = 0) {
  return chrome.tabs.sendMessage(tabId, {
    type: "DOWNLOAD_BLOB",
    payload
  }, { frameId });
}
