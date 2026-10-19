import { managerLabels } from "../popup/manager-labels.js";
export function createSiteControls(call) {
  let policies = {};
  function render(locale) {
    const labels = managerLabels(locale), list = document.getElementById("sitePolicyList"); list.replaceChildren();
    for (const id of ["sitePolicies", "origin", "detection", "credentials", "native", "addSite", "maxActive", "nativeCheck"]) document.getElementById(`${id}Label`).textContent = labels[id];
    for (const [origin, policy] of Object.entries(policies)) {
      const row = document.createElement("p"), edit = document.createElement("button"), remove = document.createElement("button");
      row.textContent = `${origin} · ${policy.detection ? "✓" : "–"} ${labels.detection} · ${policy.credentials ? "✓" : "–"} Cookie · ${policy.native ? "✓" : "–"} Native `;
      edit.textContent = origin;
      edit.onclick = () => { document.getElementById("siteOrigin").value = origin; for (const key of ["detection", "credentials", "native"]) document.getElementById(`site-${key}`).checked = policy[key]; };
      remove.textContent = labels.delete; remove.onclick = () => { delete policies[origin]; render(locale); };
      row.append(edit, remove); list.append(row);
    }
    document.getElementById("addSite").onclick = () => {
      const input = document.getElementById("siteOrigin");
      try {
        const url = new URL(input.value.trim());
        if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an HTTP(S) website origin");
        policies[url.origin] = Object.fromEntries(["detection", "credentials", "native"].map((key) => [key, document.getElementById(`site-${key}`).checked]));
        document.getElementById("siteError").textContent = ""; render(locale);
      } catch (e) { document.getElementById("siteError").textContent = e.message; }
    };
  }
  document.getElementById("nativeCheck").onclick = async () => {
    const button = document.getElementById("nativeCheck"), area = document.getElementById("nativeHealth"); button.disabled = true;
    try { const { data } = await call({ type: "NATIVE_HEALTH" }); area.textContent = `Connection / 連線: ${data.connected ? "✓" : "–"}; FFmpeg: ${data.ffmpeg ? "✓" : "–"}; ffprobe: ${data.ffprobe ? "✓" : "–"}; ${data.version || ""} ${data.error || ""}`; }
    catch (e) { area.textContent = e.message; } finally { button.disabled = false; }
  };
  return {
    load(settings, locale) { policies = structuredClone(settings.sitePolicies || {}); document.getElementById("maxActiveDownloads").value = settings.maxActiveDownloads || 2; render(locale); },
    render,
    read() { return { sitePolicies: policies, maxActiveDownloads: Number(document.getElementById("maxActiveDownloads").value) }; }
  };
}
