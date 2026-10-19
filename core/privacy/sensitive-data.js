// Share the same credential policy between history identity and diagnostic exports.
export function isSensitiveParameter(name) {
  return /^(?:token|access_token|refresh_token|id_token|auth(?:[-_]?(?:key|token))?|authorization|jwt|signature|sig|exp|expires?|expiry|policy|key-pair-id|credential|password|passwd|secret|api[-_]?key|hdnea|hdnts|hmac|session(?:id)?|cookie|AWSAccessKeyId|GoogleAccessId)$/i.test(name)
    || /^(?:x-amz-|x-goog-)/i.test(name)
    || /(?:^|[-_])(?:token|signature|secret|password|credential)(?:$|[-_])/i.test(name);
}

export function redactSensitiveText(value) {
  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === "object") return JSON.stringify(redactSensitiveValue(parsed), null, 2);
  } catch { /* Reports are usually Markdown rather than JSON. */ }
  return String(value).replace(/https?:\/\/[^\s<>"'`]+/gi, (raw) => {
    try {
      const url = new URL(raw);
      if (url.username || url.password) { url.username = "REDACTED"; url.password = ""; }
      for (const key of [...url.searchParams.keys()]) {
        if (isSensitiveParameter(key)) url.searchParams.set(key, "REDACTED");
      }
      if (url.hash) url.hash = "REDACTED";
      return url.href;
    } catch { return "[REDACTED URL]"; }
  }).replace(/\b(authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+/gi, "$1: [REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, "$1 [REDACTED]")
    .replace(/(["']?)\b((?:access[_-]?)?token|signature|password|secret|api[_-]?key)\1\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi, "$2=[REDACTED]");
}

export function redactSensitiveValue(value, key = "") {
  if (isSensitiveParameter(key) || /^(?:headers|cookies|set-cookie|proxy-authorization)$/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((entry) => redactSensitiveValue(entry));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, redactSensitiveValue(entry, name)]));
  return value;
}
