export async function saveRemuxDownload(downloadsApi, result, filename) {
  if (!result.validation?.ok || !result.objectUrl?.startsWith("blob:")) {
    throw new Error("Cannot save invalid remux output");
  }
  const id = await downloadsApi.download({
    url: result.objectUrl, filename, saveAs: false, conflictAction: "uniquify"
  });
  if (!Number.isInteger(id)) throw new Error("Unable to start finalized media download");
  return id;
}

export async function releaseRemuxUrl(objectUrl) {
  if (!objectUrl) return;
  try { await chrome.runtime.sendMessage({ type: "OFFSCREEN_RELEASE_URL", target: "offscreen", objectUrl }); }
  catch { /* Offscreen context may already have closed. */ }
}
