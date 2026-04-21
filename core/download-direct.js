export async function startDirectBrowserDownload(downloadsApi, { url, filename }) {
  return downloadsApi.download({
    url,
    filename,
    saveAs: false,
    conflictAction: "uniquify"
  });
}
