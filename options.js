import { getLocaleOptions, getTranslation, normalizeLocale } from "./i18n.js";

const VIDEO_TYPES = ["mp4", "webm", "m3u8", "blob", "mov", "m4v", "mkv", "avi", "flv", "mpeg"];

const typeGrid = document.getElementById("typeGrid");
const languageSelect = document.getElementById("languageSelect");
const downloadHistoryEnabled = document.getElementById("downloadHistoryEnabled");
const preserveOldPages = document.getElementById("preserveOldPages");
const keepSettings = document.getElementById("keepSettings");
const saveBtn = document.getElementById("saveBtn");
const clearCacheBtn = document.getElementById("clearCacheBtn");
const statusText = document.getElementById("statusText");

let locale = "en";
let messages = getTranslation(locale);

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#cf2f2f" : "#5c6b7d";
}

function applyStaticText() {
  document.documentElement.lang = locale;
  document.title = messages.options.title;
  document.querySelector("h1").textContent = messages.options.title;
  document.getElementById("languageHeading").textContent = messages.options.sections.language;
  document.getElementById("languageHelp").textContent = messages.options.labels.languageHelp;

  const sectionHeadings = [...document.querySelectorAll(".panel h2")];
  sectionHeadings[1].textContent = messages.options.sections.detectionTypes;
  sectionHeadings[2].textContent = messages.options.sections.display;
  sectionHeadings[3].textContent = messages.options.sections.cache;

  document.getElementById("downloadHistoryEnabledLabel").textContent =
    messages.options.labels.downloadHistoryEnabled || "Record downloaded video history and show downloaded badges";
  document.getElementById("preserveOldPagesLabel").textContent = messages.options.labels.preserveOldPages;
  document.getElementById("keepSettingsLabel").textContent = messages.options.labels.keepSettings;
  clearCacheBtn.textContent = messages.options.labels.clearCache;
  saveBtn.textContent = messages.options.labels.save;
}

function renderLanguageOptions(selectedLocale) {
  languageSelect.innerHTML = "";
  for (const optionData of getLocaleOptions()) {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    option.selected = optionData.value === selectedLocale;
    languageSelect.appendChild(option);
  }
}

async function callBackground(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Request failed");
  }
  return response;
}

function renderTypeToggles(settings) {
  typeGrid.innerHTML = "";
  for (const type of VIDEO_TYPES) {
    const row = document.createElement("label");
    row.className = "toggle-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.type = type;
    checkbox.checked = Boolean(settings.enabledTypes?.[type]);

    const text = document.createElement("span");
    text.textContent = type;

    row.appendChild(checkbox);
    row.appendChild(text);
    typeGrid.appendChild(row);
  }
}

function readSettingsFromForm() {
  const enabledTypes = {};
  const checkboxes = typeGrid.querySelectorAll("input[type='checkbox'][data-type]");
  for (const checkbox of checkboxes) {
    enabledTypes[checkbox.dataset.type] = checkbox.checked;
  }
  return {
    locale: normalizeLocale(languageSelect.value),
    enabledTypes,
    downloadHistoryEnabled: downloadHistoryEnabled.checked,
    preserveOldPages: preserveOldPages.checked
  };
}

async function loadSettings() {
  const response = await callBackground({ type: "GET_SETTINGS" });
  const settings = response.data;
  locale = normalizeLocale(settings.locale || locale);
  messages = getTranslation(locale);
  renderLanguageOptions(locale);
  applyStaticText();
  renderTypeToggles(settings);
  downloadHistoryEnabled.checked = settings.downloadHistoryEnabled !== false;
  preserveOldPages.checked = Boolean(settings.preserveOldPages);
}

saveBtn.addEventListener("click", async () => {
  try {
    const nextSettings = readSettingsFromForm();
    await callBackground({
      type: "UPDATE_SETTINGS",
      settings: nextSettings
    });
    locale = normalizeLocale(nextSettings.locale);
    messages = getTranslation(locale);
    applyStaticText();
    setStatus(messages.options.status.saved);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
});

clearCacheBtn.addEventListener("click", async () => {
  try {
    clearCacheBtn.disabled = true;
    await callBackground({
      type: "CLEAR_CACHE",
      keepSettings: keepSettings.checked
    });
    await loadSettings();
    setStatus(messages.options.status.cacheCleared);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    clearCacheBtn.disabled = false;
  }
});

(async () => {
  try {
    await loadSettings();
    setStatus(messages.options.status.loaded);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  }
})();
