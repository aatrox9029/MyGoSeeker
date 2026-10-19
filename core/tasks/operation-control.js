export function operationError(action = "cancel") {
  const error = new Error(action === "pause" ? "Download paused" : "Download cancelled");
  error.name = "AbortError";
  error.action = action;
  return error;
}

export function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason || operationError();
}

export function abortableDelay(ms, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); cleanup(); reject(signal.reason || operationError()); };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// Every operation settles before a paused task can be resumed.
export function createOperationRegistry() {
  const operations = new Map();
  return {
    get: (id) => operations.get(id),
    begin(id) {
      if (operations.has(id)) throw new Error("Download already in progress");
      let settle;
      const operation = { controller: new AbortController(), done: new Promise((resolve) => { settle = resolve; }) };
      operation.finish = () => { if (operations.get(id) === operation) operations.delete(id); settle(); };
      operations.set(id, operation);
      return operation;
    },
    async stop(id, action) {
      const operation = operations.get(id);
      if (!operation) return false;
      operation.controller.abort(operationError(action));
      await operation.done;
      return true;
    }
  };
}
