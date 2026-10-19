export function deriveCardTitle(candidate, pageTitle) {
  if (candidate.title) {
    return candidate.title;
  }
  if (pageTitle) {
    return pageTitle;
  }
  try {
    const url = new URL(candidate.url);
    const file = url.pathname.split("/").pop();
    if (file) {
      return decodeURIComponent(file);
    }
    return `${url.hostname} video`;
  } catch {
    return "Video";
  }
}
