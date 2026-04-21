export async function requestBlobDownload(tabId, payload) {
  return chrome.tabs.sendMessage(tabId, {
    type: "DOWNLOAD_BLOB",
    payload
  });
}
