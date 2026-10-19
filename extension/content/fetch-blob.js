async function fetchMediaBlob(url, cardId) {
  await waitForContentTask(cardId);
  const task = contentTasks.get(cardId);
  const controller = new AbortController();
  if (task) task.request = controller;
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { credentials: "include", signal: controller.signal });
    if (!response.ok) throw new Error(`Source fetch failed (${response.status})`);
    const maxBytes = 256 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > maxBytes) { await response.body?.cancel(); throw new Error("Blob exceeds safe buffer limit (256 MiB)"); }
    const reader = response.body?.getReader();
    let blob;
    if (reader) {
      const chunks = []; let size = 0;
      try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw new Error("Blob exceeds safe buffer limit (256 MiB)"); chunks.push(value); } }
      catch (error) { await reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); }
      blob = new Blob(chunks, { type: response.headers.get("content-type") || "" });
    } else { blob = await response.blob(); if (blob.size > maxBytes) throw new Error("Blob exceeds safe buffer limit (256 MiB)"); }
    if (/text\/|html|json/i.test(blob.type)) throw new Error("Source returned text instead of media");
    await waitForContentTask(cardId);
    return blob;
  } catch (error) {
    if (task?.cancelled) throw contentTaskError();
    if (task?.paused || controller.signal.reason?.action === "pause") { await waitForContentTask(cardId); return fetchMediaBlob(url, cardId); }
    throw error;
  } finally { clearTimeout(timeout); if (task?.request === controller) task.request = null; }
}
