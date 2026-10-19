export function createDiscoveryCache({ ttl = 30000, maximum = 100, now = Date.now } = {}) {
  const entries = new Map();
  const metrics = { hits: 0, misses: 0, elapsedMs: 0 };
  return {
    async get(key, load) {
      const entry = entries.get(key);
      if (entry && now() - entry.time < ttl) { metrics.hits++; return structuredClone(await entry.promise); }
      metrics.misses++; const started = now();
      const promise = Promise.resolve().then(load);
      if (entries.size >= maximum) entries.delete(entries.keys().next().value);
      entries.set(key, { time: now(), promise });
      try { return structuredClone(await promise); }
      catch (error) { entries.delete(key); throw error; }
      finally { metrics.elapsedMs += now() - started; }
    },
    clear() { entries.clear(); },
    get metrics() { return { ...metrics, entries: entries.size }; }
  };
}
