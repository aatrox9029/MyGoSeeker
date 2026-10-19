export function normalizeSitePolicies(input) {
  const result = {};
  for (const [origin, policy] of Object.entries(input || {}).slice(0, 100)) {
    if (!policy || typeof policy !== "object") continue;
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) continue;
      result[origin] = { detection: policy.detection !== false, credentials: policy.credentials !== false, native: policy.native !== false };
    } catch { /* Ignore invalid origins. */ }
  }
  return result;
}
export function getSitePolicy(settings, pageUrl) {
  try { return { detection: true, credentials: true, native: true, ...settings.sitePolicies?.[new URL(pageUrl).origin] }; }
  catch { return { detection: true, credentials: true, native: true }; }
}
