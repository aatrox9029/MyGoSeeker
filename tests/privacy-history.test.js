import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDownloadHistoryUrl, applyDownloadHistory } from "../core/history/download-history.js";
import { buildDebugReport } from "../core/debug/export-debug-report.js";
import { createMediaDebugLog, addDebugEntry } from "../core/debug/media-debug-log.js";
import { redactSensitiveText } from "../core/privacy/sensitive-data.js";
import { exportCardRecord } from "../extension/background/export-record.js";

test("history retains media identifiers, canonicalizes query order and ignores rotating credentials", () => {
  const first = normalizeDownloadHistoryUrl("https://user:pass@example.com/watch?id=1&lang=ja&token=old#fragment");
  assert.equal(first, "https://example.com/watch?id=1&lang=ja");
  assert.equal(normalizeDownloadHistoryUrl("https://example.com/watch?token=new&lang=ja&id=1"), first);
  const cards = [1, 2].map((id) => ({ variants: [{ url: `https://example.com/watch?id=${id}&lang=ja&token=new` }] }));
  assert.deepEqual(applyDownloadHistory(cards, [first], {}).map((card) => card.isPreviouslyDownloaded), [true, false]);
  assert.ok(!applyDownloadHistory(cards, [first], { downloadHistoryEnabled: false })[0].isPreviouslyDownloaded);
  assert.equal(normalizeDownloadHistoryUrl("blob:local"), "");
});

test("reports redact credentials in context, nested details, notes and free-form errors", () => {
  const url = "https://alice:hiddenpass@example.com/video?id=7&token=secrettoken&X-Amz-Signature=secret-signature#secretfragment";
  const log = createMediaDebugLog({ variantUrl: url, pageUrl: url });
  addDebugEntry(log, "error", "network", "Failed", { url, authorization: "Bearer headersecret", nested: { cookies: ["session-secret"] } });
  const result = buildDebugReport({ card: { pageUrl: url, error: "Bearer errorsecret" }, log, extraNotes: [url] });
  for (const secret of ["alice", "hiddenpass", "secrettoken", "secret-signature", "secretfragment", "headersecret", "session-secret", "errorsecret"]) assert.ok(!result.includes(secret), secret);
  assert.match(result, /id=7/);
  assert.match(JSON.stringify(log), /REDACTED/);
  assert.ok(!redactSensitiveText('{"token": "native-secret", "password":"pw-secret"}').includes("native-secret"));
  assert.ok(!redactSensitiveText('{"cookies": [{"value":"cookie-secret"}], "headers":{"Authorization":"header-secret"}}').includes("cookie-secret"));
});

test("export also sanitizes pre-existing and native report bodies", async () => {
  let saved;
  await exportCardRecord({ card: { title: "Test", debugReport: "https://example.com/?token=old-secret\nAuthorization: Bearer native-secret" },
    ensureInitialized: async () => {}, getCardDebugLog: () => null, sanitizeFileName: (value) => value,
    chromeDownloads: { download: async (value) => { saved = decodeURIComponent(value.url); } } });
  assert.ok(!saved.includes("old-secret"));
  assert.ok(!saved.includes("native-secret"));
});
