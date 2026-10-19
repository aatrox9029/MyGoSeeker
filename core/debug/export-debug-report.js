import { redactSensitiveText, redactSensitiveValue } from "../privacy/sensitive-data.js";
import { BUILD_INFO } from "./build-info.js";
import { classifyDownloadError } from "../downloads/error-guidance.js";

function formatTimestamp(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : "n/a";
}

export function buildDebugReport({ card, log, extraNotes = [] }) {
  card = redactSensitiveValue(card);
  log = redactSensitiveValue(log);
  const lines = [
    "# Video Download Debug Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Build: ${JSON.stringify(BUILD_INFO)}`,
    `Error category: ${card?.error ? classifyDownloadError(card.error) : "none"}`,
    "",
    "## Card",
    `- Title: ${card?.title || "Unknown"}`,
    `- Page URL: ${card?.pageUrl || "Unknown"}`,
    `- Status: ${card?.status || "Unknown"}`,
    `- Stage: ${card?.stage || "Unknown"}`,
    `- Error: ${card?.error || "None"}`,
    `- Download mode: ${card?.downloadMode || "unknown"}`,
    "",
    "## Debug Summary",
    `- Debug status: ${log?.status || "n/a"}`,
    `- Created: ${formatTimestamp(log?.createdAt)}`,
    `- Updated: ${formatTimestamp(log?.updatedAt)}`,
    `- Source type: ${log?.context?.sourceType || "n/a"}`,
    `- Variant URL: ${log?.context?.variantUrl || "n/a"}`
  ];

  if (card?.thumbnailDebug) lines.push("", "## Thumbnail Diagnostics", JSON.stringify(card.thumbnailDebug));

  if (log?.summary && Object.keys(log.summary).length > 0) {
    lines.push("", "## Pipeline Summary");
    for (const [key, value] of Object.entries(log.summary)) {
      lines.push(`- ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
  }

  if (Array.isArray(extraNotes) && extraNotes.length > 0) {
    lines.push("", "## Notes");
    for (const note of extraNotes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push("", "## Timeline");
  for (const entry of log?.entries || []) {
    lines.push(`- ${formatTimestamp(entry.at)} [${entry.level}] ${entry.stage}: ${entry.message}`);
    if (entry.details != null) {
      lines.push(`  details: ${JSON.stringify(entry.details)}`);
    }
  }

  return redactSensitiveText(`${lines.join("\n")}\n`);
}
