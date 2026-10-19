import { scanBinaryJobs, deleteBinaryPrefix } from "../../core/files/binary-store.js";
import { collectTemporaryFiles } from "../../core/files/storage-maintenance.js";
export function createStorageManager(getCards) {
  return async (action, cardId) => {
    const cards = getCards();
    if (action === "clear-task") {
      const card = cards[cardId];
      if (!card || ["queued", "downloading"].includes(card.status)) throw new Error("Pause the task before clearing its saved segments");
      await deleteBinaryPrefix(`hls:${cardId}:`);
    } else if (action === "cleanup") await collectTemporaryFiles(cards);
    else if (action !== "stats") throw new Error("Unknown storage action");
    const tasks = {};
    const stats = await scanBinaryJobs((key, value) => {
      const id = String(key).startsWith("hls:") ? String(key).split(":")[1] : value.cardId;
      if (id) tasks[id] = (tasks[id] || 0) + (value.byteSize || 0);
      return false;
    });
    return { ...stats, tasks, estimate: await globalThis.navigator?.storage?.estimate?.() };
  };
}
