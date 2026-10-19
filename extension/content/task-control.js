// Content scripts share this registry in their isolated world.
const contentTasks = new Map();
function contentTaskError() {
  const error = new Error("Download cancelled");
  error.name = "AbortError";
  return error;
}
async function waitForContentTask(cardId) {
  const task = contentTasks.get(cardId);
  if (!task) return;
  if (task.cancelled) throw contentTaskError();
  if (task.paused) await new Promise((resolve) => task.waiters.add(resolve));
  if (task.cancelled) throw contentTaskError();
}
function controlContentTask(cardId, action) {
  const task = contentTasks.get(cardId);
  if (!task) return { ok: false, error: "Original page task is unavailable" };
  if (!["pause", "resume", "cancel"].includes(action)) return { ok: false, error: "Unknown action" };
  task.paused = action === "pause";
  task.cancelled = action === "cancel";
  if (action !== "resume") {
    const reason = contentTaskError(); reason.action = action;
    task.request?.abort(reason);
  }
  task.onControl?.(action);
  if (action !== "pause") { for (const resolve of task.waiters) resolve(); task.waiters.clear(); }
  return { ok: true };
}
