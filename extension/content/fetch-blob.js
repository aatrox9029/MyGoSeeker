async function fetchMediaBlob(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { credentials: "include", signal: controller.signal });
    if (!response.ok) throw new Error(`Source fetch failed (${response.status})`);
    const blob = await response.blob();
    if (/text\/|html|json/i.test(blob.type)) throw new Error("Source returned text instead of media");
    return blob;
  } finally { clearTimeout(timeout); }
}
