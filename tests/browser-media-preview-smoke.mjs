import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "./browser-launch-options.mjs";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(process.env.MGS_EXTENSION_PATH || ".");
const assets = new Set(["popup.html", "manager.html", "popup.css", "manager.css", "extension/popup/card-details.js", "extension/popup/format-media-preview.js", "extension/popup/manager-labels.js"]);
const server = createServer((req, res) => {
  const name = new URL(req.url, "http://localhost").pathname.slice(1);
  if (name === "popup.js") { res.setHeader("content-type", "text/javascript"); res.end(""); return; }
  if (!assets.has(name)) { res.writeHead(404); res.end(); return; }
  res.setHeader("content-type", name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "text/html");
  res.end(readFileSync(resolve(root, name)));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let browser;
try {
  browser = await chromium.launch({ ...browserLaunchOptions(), headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [surface, width] of [["popup", 420], ["manager", 360], ["manager", 420], ["manager", 1280]]) {
    for (const locale of ["zh-TW", "en"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:${server.address().port}/${surface}.html`);
      // Real card markup and click handler; isolate layout from downloads and browser APIs.
      await page.evaluate(async (locale) => {
        const { bindCardDetails, renderCardDetails } = await import("./extension/popup/card-details.js");
        const card = document.querySelector("#cardTemplate").content.firstElementChild.cloneNode(true);
        card.querySelector(".title").textContent = "Media preview layout";
        card.querySelector(".variant-select").innerHTML = '<option value="v">1080p</option>';
        card.querySelector(".dash-label")?.setAttribute("hidden", "");
        document.querySelector("#available").append(card);
        renderCardDetails(card, { status: "available" }, locale);
        bindCardDetails(card, "layout", async (message) => {
          if (message.type !== "MEDIA_PREVIEW") throw new Error("Unexpected request");
          return { data: {
            type: "mpd", duration: 120, periods: 2, dynamic: false,
            codecs: "avc1.640028,mp4a.40.2".repeat(30),
            tracks: Array.from({ length: 30 }, (_, index) => ({ kind: "audio", language: `track-${index}`, codecs: "mp4a.40.2" })),
            audioTracks: [{ language: "en" }, { language: "zh-TW" }],
            subtitleTracks: [{ name: "Subtitle".repeat(80) }],
            limits: "Browser merge: each segment at most 16 MiB, total at most 256 MiB. Native helper supports direct/HLS. DRM is unsupported.",
            exceedsBrowserLimit: true
          } };
        }, () => locale);
      }, locale);
      const preview = page.locator("#available .preview-text");
      assert.ok(await preview.isHidden());
      await page.locator("#available .preview-btn").click();
      await preview.waitFor({ state: "visible" });
      assert.match(await preview.textContent(), locale === "zh-TW" ? /格式: MPD/ : /Format: MPD/);
      const layout = await preview.evaluate((area) => {
        const card = area.closest(".card"), content = card.querySelector(".content");
        const bounds = area.getBoundingClientRect(), cardBounds = card.getBoundingClientRect(), contentBounds = content.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, bottom: bounds.bottom, cardLeft: cardBounds.left, cardRight: cardBounds.right, cardBottom: cardBounds.bottom,
          contentRight: contentBounds.right, clientWidth: area.clientWidth, scrollWidth: area.scrollWidth,
          clientHeight: area.clientHeight, scrollHeight: area.scrollHeight, text: area.textContent };
      });
      const label = `${surface}/${width}/${locale}: ${JSON.stringify(layout)}`;
      assert.ok(layout.left >= layout.cardLeft && layout.right <= layout.cardRight && layout.right <= layout.contentRight + 1, label);
      assert.ok(layout.bottom <= layout.cardBottom && layout.clientHeight <= 280, label);
      assert.ok(layout.scrollWidth <= layout.clientWidth + 1, label);
      assert.ok(layout.scrollHeight > layout.clientHeight, "Long previews should scroll vertically");
      await preview.evaluate((area) => { area.scrollTop = area.scrollHeight; });
      assert.ok(await preview.evaluate((area) => area.scrollTop > 0));
      assert.match(layout.text, locale === "zh-TW" ? /請降低畫質/ : /select a smaller quality/);
      console.log(`Media preview contained and scrollable: ${surface}, ${width}px, ${locale}`);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
