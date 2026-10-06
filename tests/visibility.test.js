import test from "node:test";
import assert from "node:assert/strict";
import { getVisibleCards } from "../extension/background/visible-cards.js";
import { retainDownloadTask } from "../core/history/retain-download-task.js";

test("downloads and completions are visible from B with old-page retention disabled", () => {
  const cards = [
    { id: "A1", tabId: 1, status: "downloading" },
    { id: "A2", tabId: 1, status: "completed" },
    { id: "A3", tabId: 1, status: "available" },
    { id: "B1", tabId: 2, status: "available" }
  ];
  assert.deepEqual(getVisibleCards(cards, 2, { preserveOldPages: false }).map((card) => card.id), ["A1", "A2", "B1"]);
  assert.deepEqual(getVisibleCards(cards, -1, { preserveOldPages: false }).map((card) => card.id), ["A1", "A2"]);
});

test("explicit hiding and the old-page setting still apply", () => {
  const cards = [
    { id: "hidden", tabId: 1, status: "completed", ignored: true },
    { id: "old", tabId: 1, status: "available" }
  ];
  assert.deepEqual(getVisibleCards(cards, 2, { preserveOldPages: true }).map((card) => card.id), ["old"]);
  assert.ok(retainDownloadTask({ status: "completed" }));
  assert.ok(retainDownloadTask({ status: "downloading" }));
  assert.equal(retainDownloadTask({ status: "available" }), false);
});
