let lastCaptureAt = 0;
let capturing = false;
export async function capturePlayerView(sender) {
  if (!sender?.tab || sender.frameId) throw new Error("Visible capture requires a top-level player");
  if (capturing || Date.now() - lastCaptureAt < 1100) throw new Error("Visible capture is busy; retry on next scan");
  capturing = true;
  try {
    const tab = await chrome.tabs.get(sender.tab.id);
    if (!tab.active || tab.url !== sender.tab.url) throw new Error("Player tab is not active");
    lastCaptureAt = Date.now();
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 85 });
    const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tab.id || active.url !== tab.url) throw new Error("Player tab changed during capture");
    return { ok: true, dataUrl };
  } finally { capturing = false; }
}
