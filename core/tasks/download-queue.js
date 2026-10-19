// Reservations bound extension-owned buffers; browser/native download buffers are external.
export const STREAM_RESERVATION = 768 * 1024 * 1024;
export const DIRECT_RESERVATION = 8 * 1024 * 1024;
export function createDownloadQueue({ maxActive = 2, maxBytes = 800 * 1024 * 1024, onEvent = () => {} } = {}) {
  const active = new Map(), pending = [];
  let draining = false;
  function drain() {
    if (draining) return;
    draining = true;
    try {
      while (pending.length && active.size < maxActive) {
        const used = [...active.values()].reduce((sum, item) => sum + item.bytes, 0);
        const ordered = pending.map((item, index) => ({ item, index })).sort((a, b) => b.item.priority - a.item.priority || a.item.queuedAt - b.item.queuedAt);
        const oldest = ordered.find(({ item }) => Date.now() - item.queuedAt > 30000);
        const index = oldest && used + oldest.item.bytes > maxBytes ? -1 : (ordered.find(({ item }) => used + item.bytes <= maxBytes)?.index ?? -1);
        if (index < 0) break;
        const [item] = pending.splice(index, 1);
        active.set(item.id, item);
        onEvent("started", { id: item.id, usedBytes: used + item.bytes, active: active.size });
        Promise.resolve().then(item.run).catch(item.onError).catch(console.error).finally(item.resolve);
      }
    } finally { draining = false; }
  }
  return {
    enqueue(id, bytes, run, onError = console.error) {
      if (active.has(id) || pending.some((item) => item.id === id)) throw new Error("Download already queued");
      if (!Number.isFinite(bytes) || bytes <= 0 || bytes > maxBytes) throw new Error("Task exceeds global memory budget");
      let resolve;
      const done = new Promise((finish) => { resolve = finish; });
      pending.push({ id, bytes, run, onError, resolve, priority: 0, queuedAt: Date.now() }); onEvent("queued", { id, pending: pending.length }); drain();
      return { started: active.has(id), done };
    },
    release(id) { active.delete(id); drain(); },
    cancel(id) { const index = pending.findIndex((item) => item.id === id); if (index < 0) return false; const [item] = pending.splice(index, 1); item.resolve(); onEvent("removed", { id }); drain(); return true; },
    restore(id, bytes) { active.set(id, { id, bytes }); },
    has: (id) => active.has(id) || pending.some((item) => item.id === id),
    configure(value) { maxActive = Math.min(4, Math.max(1, Math.floor(Number(value) || 2))); drain(); },
    prioritize(id) { const item = pending.find((task) => task.id === id); if (!item) throw new Error("Only queued tasks can be prioritized"); item.priority = Math.max(0, ...pending.map((task) => task.priority)) + 1; onEvent("prioritized", { id }); drain(); },
    get snapshot() { return { active: [...active.keys()], pending: pending.map((item) => item.id), reservedBytes: [...active.values()].reduce((sum, item) => sum + item.bytes, 0), maxBytes, maxActive }; }
  };
}
