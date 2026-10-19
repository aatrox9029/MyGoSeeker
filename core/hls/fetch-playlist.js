import { fetchTextWithRetry } from "./download-segments.js";
export async function fetchPlaylist(url, options = {}) {
  let finalUrl = url;
  const text = await fetchTextWithRetry(url, {
    maxBytes: 2 * 1024 * 1024, ...options, onResponse: (response) => { finalUrl = response.url || url; }
  });
  if (!/^\s*#EXTM3U(?:\s|$)/.test(text)) throw new Error("Server returned an invalid HLS playlist");
  return { text, url: finalUrl };
}
