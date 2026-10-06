export async function fetchWithRetry(url, responseType, options = {}) {
  const { logger, stage = "fetch", retries = 3, retryDelayMs = 400,
    timeoutMs = 30000, byteRange, fetchImpl = fetch, onResponse } = options;
  let lastError;
  for (let attempt = 1; attempt <= Math.max(1, retries); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let retryable = true;
    let retryAfterMs = 0;
    try {
      const headers = new Headers(options.headers);
      if (byteRange) headers.set("Range", `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}`);
      logger?.("info", stage, "Fetching resource", { url, attempt, retries, byteRange });
      const response = await fetchImpl(url, { credentials: "include", headers, signal: controller.signal });
      if (!response.ok) {
        retryable = [408, 425, 429].includes(response.status) || response.status >= 500;
        const delay = response.headers.get("retry-after");
        retryAfterMs = Math.min(30000, Math.max(0, /^\d+$/.test(delay || "")
          ? Number(delay) * 1000 : Date.parse(delay) - Date.now()) || 0);
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      let data = await response[responseType]();
      if (responseType === "arrayBuffer") {
        if (byteRange) {
          if (response.status === 200) {
            if (data.byteLength < byteRange.offset + byteRange.length) throw new Error("Incomplete byte-range response");
            data = data.slice(byteRange.offset, byteRange.offset + byteRange.length);
          } else {
            const range = response.headers.get("content-range") || "";
            const expected = `bytes ${byteRange.offset}-${byteRange.offset + byteRange.length - 1}/`;
            if (!range.startsWith(expected) || data.byteLength !== byteRange.length) throw new Error("Invalid byte-range response");
          }
        }
        if (!data.byteLength) throw new Error("Empty media response");
        if (/text\/|json|html/i.test(response.headers.get("content-type") || "")) {
          retryable = false;
          throw new Error("Server returned text instead of media");
        }
      }
      onResponse?.(response);
      logger?.("info", stage, "Resource received", { attempt, status: response.status, bytes: data.byteLength });
      return data;
    } catch (error) {
      lastError = controller.signal.aborted ? new Error(`Fetch timed out after ${timeoutMs}ms`)
        : error instanceof Error ? error : new Error(String(error));
      logger?.("warn", stage, "Resource fetch failed", { url, attempt, retryable, error: lastError.message });
      if (!retryable || attempt >= retries) throw lastError;
    } finally { clearTimeout(timer); }
    await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfterMs, retryDelayMs * 2 ** (attempt - 1))));
  }
  throw lastError;
}
