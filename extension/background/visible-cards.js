import { retainDownloadTask } from "../../core/history/retain-download-task.js";

export function getVisibleCards(cards, activeTabId, settings) {
  return cards.filter((card) => !card.ignored
    && (settings.preserveOldPages || card.tabId === activeTabId || retainDownloadTask(card)));
}
