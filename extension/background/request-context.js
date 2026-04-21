import { HEADER_ALLOWLIST } from "../native/protocol.js";

function toOrigin(rawUrl) {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return "";
  }
}

function normalizeCookie(cookie) {
  return {
    name: cookie.name || "",
    value: cookie.value || "",
    domain: cookie.domain || "",
    path: cookie.path || "/",
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: cookie.sameSite || "unspecified",
    expirationDate: Number.isFinite(cookie.expirationDate) ? cookie.expirationDate : 0
  };
}

function buildHeaderMap({ pageUrl, mediaUrl }) {
  const origin = toOrigin(pageUrl || mediaUrl);
  const userAgent = typeof navigator?.userAgent === "string" ? navigator.userAgent : "";
  const language = typeof navigator?.language === "string" ? navigator.language : "en-US";
  const headers = {
    Referer: pageUrl || mediaUrl,
    Origin: origin,
    "User-Agent": userAgent,
    Accept: "*/*",
    "Accept-Language": language
  };

  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value) {
      continue;
    }
    if (!HEADER_ALLOWLIST.includes(key.toLowerCase())) {
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

async function getCookiesForUrl(targetUrl) {
  if (!chrome.cookies || !targetUrl) {
    return [];
  }
  try {
    const cookies = await chrome.cookies.getAll({ url: targetUrl });
    return Array.isArray(cookies) ? cookies.map(normalizeCookie) : [];
  } catch {
    return [];
  }
}

export async function collectRequestContext({ card, variant }) {
  const pageUrl = typeof card?.pageUrl === "string" ? card.pageUrl : "";
  const mediaUrl = typeof variant?.url === "string" ? variant.url : "";
  let tabUrl = pageUrl;

  if (Number.isInteger(card?.tabId) && card.tabId >= 0) {
    try {
      const tab = await chrome.tabs.get(card.tabId);
      if (tab?.url) {
        tabUrl = tab.url;
      }
    } catch {
      tabUrl = pageUrl;
    }
  }

  return {
    tabUrl,
    pageUrl,
    topFrameUrl: tabUrl || pageUrl,
    referer: pageUrl || tabUrl || mediaUrl,
    origin: toOrigin(pageUrl || tabUrl || mediaUrl),
    userAgent: typeof navigator?.userAgent === "string" ? navigator.userAgent : "",
    headers: buildHeaderMap({ pageUrl: pageUrl || tabUrl, mediaUrl }),
    cookies: await getCookiesForUrl(mediaUrl || pageUrl || tabUrl)
  };
}
