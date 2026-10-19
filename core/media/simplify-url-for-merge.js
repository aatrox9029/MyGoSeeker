export function simplifyUrlForMerge(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return "";
  }
  if (rawUrl.startsWith("blob:")) {
    return rawUrl;
  }
  try {
    const url = new URL(rawUrl);
    let path = url.pathname.toLowerCase();
    path = path.replace(/\/\d{2,5}x\d{2,5}(?=\/)/g, "");
    path = path.replace(/\/(2160|1440|1080|720|540|480|360|240)p(?=\/)/g, "");
    path = path.replace(/(?:^|[_\-\.])(2160|1440|1080|720|540|480|360|240)p?(?=[_\-\.]|$)/g, "");
    path = path.replace(/(?:^|[_\-\.])(low|mid|high|hd|fhd|uhd)(?=[_\-\.]|$)/g, "");
    path = path.replace(/(?:^|[_\-\.])\d{3,5}k(?=[_\-\.]|$)/g, "");
    path = path.replace(/\.(mp4|webm|m3u8|mov|m4v|mkv|avi|flv|mpeg|mpg)$/g, "");
    path = path.replace(/\/{2,}/g, "/");
    return `${url.origin}${path}`;
  } catch {
    return rawUrl.split("?")[0].toLowerCase();
  }
}
