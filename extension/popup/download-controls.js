const LABELS = {
  en: { pause: "Pause", resume: "Resume", cancel: "Cancel" },
  "zh-Hant": { pause: "暫停", resume: "繼續", cancel: "取消" },
  "zh-Hans": { pause: "暂停", resume: "继续", cancel: "取消" },
  ja: { pause: "一時停止", resume: "再開", cancel: "キャンセル" }
};

export function bindDownloadControls(node, cardId, callBackground) {
  for (const action of ["pause", "resume", "cancel"]) {
    const button = node.querySelector(`.${action}-btn`);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await callBackground({ type: "CONTROL_DOWNLOAD", cardId, action }); }
      catch (error) { node.querySelector(".error-text").textContent = error.message; }
      finally { button.disabled = false; }
    });
  }
}

export function renderDownloadControls(node, card, locale) {
  const labels = LABELS[locale] || LABELS.en;
  for (const action of ["pause", "resume", "cancel"]) {
    const button = node.querySelector(`.${action}-btn`);
    button.textContent = labels[action];
    button.hidden = action === "pause" ? card.status !== "downloading"
      : action === "resume" ? card.status !== "paused" : !["queued", "downloading", "paused"].includes(card.status);
  }
  node.querySelector(".variant-select").disabled = ["queued", "downloading", "paused"].includes(card.status);
}
