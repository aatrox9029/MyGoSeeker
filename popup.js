import { getTranslation, normalizeLocale, translateStage } from "./i18n.js";
import { createStateRefreshController } from "./extension/popup/state-refresh.js";
import { createSetupBannerController } from "./extension/popup/setup-banner.js";
import { RELEASES_PAGE_URL } from "./extension/background/setup-release.js";

let activeTab = "available";
let activeTabId = -1;
let state = { cards: [], settings: {} };
let locale = "en";
let messages = getTranslation(locale);
const cardNodes = new Map();

const tabButtons = [...document.querySelectorAll(".tab")];
const panels = {
  available: document.getElementById("available"),
  downloading: document.getElementById("downloading"),
  completed: document.getElementById("completed")
};
const template = document.getElementById("cardTemplate");
const stateRefreshController = createStateRefreshController({
  refreshState
});
const setupBannerController = createSetupBannerController({
  container: document.getElementById("setupBanner"),
  messageNode: document.getElementById("setupBannerText"),
  downloadButton: document.getElementById("setupDownloadBtn"),
  refreshButton: document.getElementById("setupRefreshBtn"),
  requestState: (forceRefresh = false) => callBackground({
    type: "GET_SETUP_STATE",
    forceRefresh
  }),
  openSetupPage: async (url) => {
    await chrome.tabs.create({
      url: url || RELEASES_PAGE_URL
    });
  },
  getMessages: () => messages
});

function formatStatus(card) {
  const progress = Number.isFinite(card.progress) ? Math.round(card.progress) : 0;
  const stage = translateStage(locale, card.stage || "Ready");
  const mode = card.downloadMode ? ` [${card.downloadMode}]` : "";
  return `${stage}${mode} ${progress > 0 ? `(${progress}%)` : ""}`.trim();
}

function getCardsBySection(section) {
  if (section === "available") {
    return state.cards.filter((card) => card.status === "available" || card.status === "error");
  }
  if (section === "downloading") {
    return state.cards.filter((card) => card.status === "downloading");
  }
  return state.cards.filter((card) => card.status === "completed");
}

function updateTabUi() {
  for (const button of tabButtons) {
    const selected = button.dataset.tab === activeTab;
    button.classList.toggle("active", selected);
  }
  for (const [key, panel] of Object.entries(panels)) {
    panel.classList.toggle("active", key === activeTab);
  }
}

async function callBackground(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Request failed");
  }
  return response;
}

function renderEmpty(panel, text) {
  panel.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = text;
  panel.appendChild(empty);
}

function variantInfoCompletenessRank(variant) {
  const label = typeof variant.label === "string" ? variant.label : "";
  const url = typeof variant.url === "string" ? variant.url : "";
  const hasResolution = /(\d{3,4})[x*](\d{3,4})/i.test(label)
    || /(?:^|[^\d])(\d{3,4})p(?:[^\d]|$)/i.test(label)
    || /(?:^|[^\d])(\d{3,4})[x*](\d{3,4})(?:[^\d]|$)/i.test(url)
    || /(?:^|[^\d])(2160|1440|1080|720|540|480|360|240)p?(?:[^\d]|$)/i.test(url);
  const hasBitrate = /(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i.test(label)
    || /(?:^|[^\d])(\d{3,5})k(?:[^\d]|$)/i.test(url);
  if (hasResolution && hasBitrate) {
    return 2;
  }
  if (hasResolution || hasBitrate) {
    return 1;
  }
  return 0;
}

function sortVariantsForDisplay(variants) {
  return [...variants].sort((a, b) => {
    if (a.isBlob !== b.isBlob) {
      return a.isBlob ? 1 : -1;
    }
    const aComplete = variantInfoCompletenessRank(a);
    const bComplete = variantInfoCompletenessRank(b);
    if (aComplete !== bComplete) {
      return bComplete - aComplete;
    }
    if (Number.isFinite(a.score) && Number.isFinite(b.score) && b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.isM3u8 !== b.isM3u8) {
      return a.isM3u8 ? -1 : 1;
    }
    return (b.detectedAt || 0) - (a.detectedAt || 0);
  });
}

function formatVariantDisplayLabel(label) {
  if (typeof label !== "string") {
    return "";
  }
  return label.replace(/(\d{3,4})x(\d{3,4})/gi, "$1*$2");
}

function applyStaticText() {
  document.documentElement.lang = locale;
  document.title = messages.popup.title;
  document.getElementById("rescanBtn").textContent = messages.popup.toolbar.rescan;
  document.getElementById("resetBypassBtn").textContent = messages.popup.toolbar.resetBypass;
  document.getElementById("openOptionsBtn").textContent = messages.popup.toolbar.settings;
  for (const button of tabButtons) {
    button.textContent = messages.popup.tabs[button.dataset.tab];
  }
  setupBannerController.render();
}

function createCardElement(card) {
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.cardId = card.id;
  const thumb = node.querySelector(".thumb");
  const title = node.querySelector(".title");
  const select = node.querySelector(".variant-select");
  const downloadBtn = node.querySelector(".download-btn");
  const exportBtn = node.querySelector(".export-record-btn");
  const ignoreBtn = node.querySelector(".ignore-btn");
  const progressInner = node.querySelector(".progress-inner");
  const statusText = node.querySelector(".status-text");
  const errorText = node.querySelector(".error-text");
  const variantLabel = node.querySelector(".variant-row span");
  const downloadedBadge = node.querySelector(".downloaded-badge");

  select.addEventListener("change", async () => {
    try {
      await callBackground({
        type: "SELECT_VARIANT",
        cardId: card.id,
        variantId: select.value
      });
    } catch (error) {
      console.error(error);
    }
  });

  downloadBtn.textContent = card.status === "completed"
    ? messages.popup.labels.downloadAgain
    : card.status === "error"
      ? messages.popup.labels.retry
      : messages.popup.labels.download;
  downloadBtn.disabled = card.status === "downloading";
  downloadBtn.addEventListener("click", async () => {
    try {
      downloadBtn.disabled = true;
      await callBackground({
        type: "DOWNLOAD_CARD",
        cardId: card.id,
        variantId: select.value
      });
    } catch (error) {
      console.error(error);
      downloadBtn.disabled = false;
    }
  });

  exportBtn.textContent = messages.popup.labels.exportRecord;
  exportBtn.addEventListener("click", async () => {
    try {
      exportBtn.disabled = true;
      await callBackground({
        type: "EXPORT_RECORD",
        cardId: card.id
      });
    } catch (error) {
      console.error(error);
      alert(`${messages.popup.alerts.exportError}: ${error.message || "Unknown error"}`);
    } finally {
      exportBtn.disabled = false;
    }
  });

  ignoreBtn.addEventListener("click", async () => {
    try {
      await callBackground({
        type: "IGNORE_CARD",
        cardId: card.id
      });
    } catch (error) {
      console.error(error);
    }
  });

  node._refs = {
    thumb,
    title,
    select,
    downloadBtn,
    exportBtn,
    ignoreBtn,
    progressInner,
    statusText,
    errorText,
    variantLabel,
    downloadedBadge
  };
  updateCardElement(node, card);
  return node;
}

function syncVariantOptions(select, card) {
  const variants = sortVariantsForDisplay(card.variants);
  const nextOptions = variants.map((variant) => ({
    value: variant.id,
    text: `${formatVariantDisplayLabel(variant.label)} - ${variant.source}`
  }));
  const currentOptions = [...select.options].map((option) => ({
    value: option.value,
    text: option.textContent || ""
  }));

  const optionsChanged = nextOptions.length !== currentOptions.length
    || nextOptions.some((option, index) => option.value !== currentOptions[index]?.value || option.text !== currentOptions[index]?.text);

  if (optionsChanged) {
    select.innerHTML = "";
    for (const variant of nextOptions) {
      const option = document.createElement("option");
      option.value = variant.value;
      option.textContent = variant.text;
      select.appendChild(option);
    }
  }

  if (select.value !== card.selectedVariantId) {
    select.value = card.selectedVariantId;
  }
}

function updateCardElement(node, card) {
  const {
    thumb,
    title,
    select,
    downloadBtn,
    exportBtn,
    ignoreBtn,
    progressInner,
    statusText,
    errorText,
    variantLabel,
    downloadedBadge
  } = node._refs;

  if (thumb.dataset.src !== (card.thumbnail || "")) {
    thumb.src = card.thumbnail || "";
    thumb.dataset.src = card.thumbnail || "";
  }
  title.textContent = card.title || messages.popup.labels.videoFallback;
  downloadedBadge.textContent = messages.popup.labels.downloaded || "Downloaded";
  downloadedBadge.hidden = !card.isPreviouslyDownloaded || (card.status !== "available" && card.status !== "error");
  ignoreBtn.title = messages.popup.labels.ignore;
  ignoreBtn.setAttribute("aria-label", messages.popup.labels.ignore);
  variantLabel.textContent = messages.popup.labels.variant;
  exportBtn.title = messages.popup.labels.exportRecord;
  exportBtn.textContent = messages.popup.labels.exportRecord;

  syncVariantOptions(select, card);

  downloadBtn.textContent = card.status === "completed"
    ? messages.popup.labels.downloadAgain
    : card.status === "error"
      ? messages.popup.labels.retry
      : messages.popup.labels.download;
  downloadBtn.disabled = card.status === "downloading";
  exportBtn.style.display = (card.status === "completed" || card.status === "error" || card.debugReport) ? "block" : "none";
  progressInner.style.width = `${Math.max(0, Math.min(100, card.progress || 0))}%`;
  statusText.textContent = formatStatus(card);
  errorText.textContent = card.error || "";
}

function renderSection(section, emptyText) {
  const panel = panels[section];
  const cards = getCardsBySection(section);
  if (cards.length === 0) {
    renderEmpty(panel, emptyText);
    return;
  }

  if (panel.firstElementChild?.classList.contains("empty")) {
    panel.innerHTML = "";
  }

  const nextIds = new Set();
  for (const card of cards) {
    nextIds.add(card.id);
    const existingNode = cardNodes.get(card.id) || createCardElement(card);
    cardNodes.set(card.id, existingNode);
    updateCardElement(existingNode, card);
    panel.appendChild(existingNode);
  }

  for (const child of [...panel.children]) {
    const cardId = child.dataset?.cardId;
    if (cardId && !nextIds.has(cardId)) {
      child.remove();
    }
  }
}

function render() {
  updateTabUi();
  renderSection("available", messages.popup.empty.available);
  renderSection("downloading", messages.popup.empty.downloading);
  renderSection("completed", messages.popup.empty.completed);
  const validIds = new Set(state.cards.map((card) => card.id));
  for (const [cardId, node] of cardNodes.entries()) {
    if (!validIds.has(cardId)) {
      node.remove();
      cardNodes.delete(cardId);
    }
  }
}

async function refreshState() {
  const response = await callBackground({
    type: "GET_STATE",
    activeTabId
  });
  state = response.data;
  locale = normalizeLocale(state.settings?.locale || locale);
  messages = getTranslation(locale);
  applyStaticText();
  render();
}

async function initActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tabs[0]?.id ?? -1;
}

function bindActions() {
  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      updateTabUi();
    });
  }

  document.getElementById("rescanBtn").addEventListener("click", async () => {
    try {
      await callBackground({
        type: "RESCAN_TAB",
        tabId: activeTabId
      });
      await refreshState();
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("resetBypassBtn").addEventListener("click", async () => {
    try {
      await callBackground({ type: "RESET_BYPASS" });
      await refreshState();
    } catch (error) {
      console.error(error);
    }
  });

  document.getElementById("openOptionsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE_UPDATED") {
      stateRefreshController.schedule();
    }
  });
}

(async () => {
  try {
    bindActions();
    await initActiveTab();
    await Promise.all([
      refreshState(),
      setupBannerController.refresh()
    ]);
  } catch (error) {
    console.error(error);
  }
})();
