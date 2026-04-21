async function fetchWithRetry(url, responseType, { logger, stage, retries = 3, retryDelayMs = 400 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      logger?.("info", stage, `Fetching ${url}`, { attempt, retries });
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (responseType === "arrayBuffer") {
        return await response.arrayBuffer();
      }
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger?.("warn", stage, `Fetch failed for ${url}`, { attempt, error: lastError.message });
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }
  throw lastError || new Error(`Fetch failed for ${url}`);
}

export function createRetryFetchLogger(debugLog, addDebugEntry) {
  return (level, stage, message, details) => addDebugEntry(debugLog, level, stage, message, details);
}

export async function fetchTextWithRetry(url, options = {}) {
  return fetchWithRetry(url, "text", options);
}

export async function downloadMediaPlaylistResources(playlist, options = {}) {
  const resources = [];
  if (playlist?.initSegment?.url) {
    resources.push({
      kind: "init",
      sourceUrl: playlist.initSegment.url,
      bytes: await fetchWithRetry(playlist.initSegment.url, "arrayBuffer", {
        ...options,
        stage: `${options.stagePrefix || "playlist"} init`
      })
    });
  }

  for (let index = 0; index < (playlist?.segments || []).length; index += 1) {
    const segment = playlist.segments[index];
    resources.push({
      kind: "segment",
      index,
      duration: segment.duration || 0,
      sourceUrl: segment.url,
      bytes: await fetchWithRetry(segment.url, "arrayBuffer", {
        ...options,
        stage: `${options.stagePrefix || "playlist"} segment`
      })
    });
  }

  return resources;
}
