// downloads.onChanged does not emit bytesReceived changes: sample the download API.
export function createDownloadProgressMonitor({ getCards, downloads, setCardStatus, interval = 1000 }) {
  const samples = new Map(); let timer, busy = false;
  async function poll() {
    if (busy) return;
    busy = true;
    try {
      const cards = getCards().filter((card) => card.activeDownloadId && card.status === "downloading");
      for (const card of cards) {
        const [item] = await downloads.search({ id: card.activeDownloadId });
        if (!item || item.state !== "in_progress" || card.status !== "downloading" || card.activeDownloadId !== item.id) continue;
        const now = Date.now(), old = samples.get(item.id);
        const speed = old ? Math.max(0, (item.bytesReceived - old.bytes) / Math.max(0.001, (now - old.time) / 1000)) : 0;
        samples.set(item.id, { bytes: item.bytesReceived, time: now });
        await setCardStatus(card.id, { progress: item.totalBytes > 0 ? Math.min(99, item.bytesReceived / item.totalBytes * 100) : card.progress,
          bytesReceived: item.bytesReceived, totalBytes: Math.max(0, item.totalBytes), speed, eta: speed && item.totalBytes > 0 ? (item.totalBytes - item.bytesReceived) / speed : null });
      }
      for (const id of samples.keys()) if (!cards.some((card) => card.activeDownloadId === id)) samples.delete(id);
      if (!cards.length) { clearInterval(timer); timer = undefined; }
    } catch (error) { console.error("Download progress polling failed", error); }
    finally { busy = false; }
  }
  return { start() { if (!timer) { timer = setInterval(poll, interval); timer.unref?.(); } }, poll };
}
