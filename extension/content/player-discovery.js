const observedPlayerRoots = new WeakSet();
function getPlayerRoots(root = document) {
  const roots = [root];
  for (let index = 0; index < roots.length; index++) {
    for (const element of roots[index].querySelectorAll("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  return roots;
}
function discoverVideoElements() { return getPlayerRoots().flatMap((root) => [...root.querySelectorAll("video")]); }
function observePlayerRoots() {
  for (const root of getPlayerRoots()) {
    if (observedPlayerRoots.has(root)) continue;
    observedPlayerRoots.add(root);
    new MutationObserver(scheduleScan).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "poster", "data-src", "data-url", "data-hls", "data-video-url"] });
    for (const type of ["loadedmetadata", "loadeddata", "canplay", "playing", "seeked", "emptied"]) root.addEventListener(type, (event) => {
      if (type === "emptied") thumbnailCacheByVideo.delete(event.target);
      scheduleScan();
    }, true);
  }
}
