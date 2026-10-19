import { managerLabels } from "./manager-labels.js";
import { formatMediaPreview } from "./format-media-preview.js";
export function bindCardDetails(node, cardId, call, getLocale) {
  const preview = node.querySelector(".preview-btn"), priority = node.querySelector(".priority-btn"), recover = node.querySelector(".recover-btn");
  if (!preview) return;
  preview.onclick = async () => {
    const area = node.querySelector(".preview-text"); preview.disabled = true;
    try {
      const { data } = await call({ type: "MEDIA_PREVIEW", cardId, variantId: node.querySelector(".variant-select").value });
      area.textContent = formatMediaPreview(data, getLocale()); area.hidden = false;
    } catch (e) { node.querySelector(".error-text").textContent = e.message; }
    finally { preview.disabled = false; }
  };
  priority.onclick = async () => { try { await call({ type: "PRIORITIZE_TASK", cardId }); } catch (e) { node.querySelector(".error-text").textContent = e.message; } };
  recover.onclick = async () => { try { await call({ type: "RECOVER_SOURCE", cardId }); } catch (e) { node.querySelector(".error-text").textContent = e.message; } };
}
export function renderCardDetails(node, card, locale) {
  const labels = managerLabels(locale), preview = node.querySelector(".preview-btn"); if (!preview) return;
  preview.textContent = labels.preview;
  node.querySelector(".priority-btn").textContent = labels.priority;
  node.querySelector(".priority-btn").hidden = card.status !== "queued";
  node.querySelector(".recover-btn").textContent = labels.recovery;
  node.querySelector(".recover-btn").hidden = !/401|403|expired/i.test(card.error || "");
}
