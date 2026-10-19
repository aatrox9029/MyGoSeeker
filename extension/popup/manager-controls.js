import { managerLabels } from "./manager-labels.js";
import { BUILD_INFO } from "../../core/debug/build-info.js";
export function bindManagerControls({ call, getState, refresh, locale }) {
  const labels = managerLabels(locale), error = document.getElementById("managementError");
  const report = (message) => { error.textContent = message; };
  const selected = () => [...document.querySelectorAll(".panel.active .batch-select:checked")].map((input) => input.closest(".card").dataset.cardId);
  const button = (id, action) => {
    const node = document.getElementById(id); if (!node) return;
    node.textContent = labels[id];
    node.onclick = async () => { node.disabled = true; try { await action(); await refresh(); } catch (e) { report(e.message); } finally { node.disabled = false; } };
  };
  for (const [id, action] of [["pauseAll", "pause"], ["resumeAll", "resume"], ["cancelAll", "cancel"], ["retryAll", "retry"]]) button(id, async () => {
    const cards = getState().cards.filter((card) => selected().includes(card.id));
    const eligible = cards.filter((card) => action === "retry" ? card.status === "error" : action === "pause" ? ["queued", "downloading"].includes(card.status) : action === "resume" ? card.status === "paused" : ["queued", "downloading", "paused"].includes(card.status));
    console.debug("Batch download control", JSON.stringify({ action, selected: cards.map(({ id, status }) => ({ id, status })), eligible: eligible.length }));
    const results = await Promise.allSettled(eligible.map((card) => call(action === "retry" ? { type: "DOWNLOAD_CARD", cardId: card.id, variantId: card.selectedVariantId } : { type: "CONTROL_DOWNLOAD", cardId: card.id, action })));
    report(results.filter((item) => item.status === "rejected").map((item) => item.reason.message).join("; "));
  });
  const storage = async (action = "stats", cardId) => {
    const { data } = await call({ type: "STORAGE_MANAGER", action, cardId });
    document.getElementById("storageStats").textContent = `${(data.bytes / 1048576).toFixed(2)} MiB / 512 MiB · ${Object.keys(data.tasks).length} tasks`;
    document.getElementById("storageTasks").replaceChildren();
    for (const [id, bytes] of Object.entries(data.tasks)) { const row = document.createElement("p"); row.textContent = `${getState().cards.find((card) => card.id === id)?.title || id}: ${(bytes / 1048576).toFixed(2)} MiB`; document.getElementById("storageTasks").appendChild(row); }
  };
  button("inspect", () => storage()); button("cleanup", () => storage("cleanup"));
  button("clearTask", async () => { for (const id of selected()) await storage("clear-task", id); });
  let history = [];
  const renderHistory = () => {
    const search = document.getElementById("searchHistory").value.toLowerCase(), filter = document.getElementById("historyFilter").value;
    const list = document.getElementById("historyEntries"); list.replaceChildren();
    for (const url of history.filter((value) => value.toLowerCase().includes(search) && (filter === "all" || new URL(value).pathname.toLowerCase().endsWith(`.${filter}`)))) {
      const row = document.createElement("div"), text = document.createElement("span"), remove = document.createElement("button");
      text.textContent = url; remove.textContent = labels.delete;
      remove.onclick = async () => { try { history = (await call({ type: "HISTORY_DELETE", url })).data; renderHistory(); await refresh(); } catch (e) { report(e.message); } };
      row.append(text, remove); list.appendChild(row);
    }
  };
  const historySearch = document.getElementById("searchHistory");
  if (historySearch) {
    historySearch.placeholder = labels.searchHistory; historySearch.setAttribute("aria-label", labels.searchHistory);
    document.getElementById("historyFilter").setAttribute("aria-label", labels.historyFilter);
    historySearch.oninput = renderHistory; document.getElementById("historyFilter").onchange = renderHistory;
    button("exportHistory", () => { const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" }), url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = "MyGoSeeker-history.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
    call({ type: "HISTORY_LIST" }).then((response) => { history = response.data; renderHistory(); }).catch((e) => report(e.message));
    storage().catch((e) => report(e.message));
    call({ type: "DISCOVERY_METRICS" }).then(({ data }) => {
      const frames = Object.values(data.frames), scans = frames.reduce((sum, item) => sum + item.scans, 0), skipped = frames.reduce((sum, item) => sum + item.skipped, 0);
      const zh = locale?.startsWith("zh");
      document.getElementById("discoveryStats").textContent = `${labels.metrics}: ${data.dash.misses} DASH ${zh ? "解析" : "parses"}, ${data.dash.hits} ${zh ? "快取命中" : "cache hits"}, ${data.dash.elapsedMs.toFixed(1)} ms · ${scans} ${zh ? "頁面掃描" : "page scans"}, ${skipped} ${zh ? "略過重複掃描" : "repeated scans skipped"}`;
    }).catch((e) => report(e.message));
    document.getElementById("buildInfo").textContent = `${labels.build}: ${BUILD_INFO.version} · ${BUILD_INFO.builtAt} · ${BUILD_INFO.revision}`;
  }
}
