"""HTTP context with scoped cookies and credential-safe redirects."""
from http.cookiejar import Cookie, CookieJar
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener

ALLOWED_HEADERS = {"referer", "origin", "user-agent", "authorization", "accept", "accept-language"}


def validate_url(url):
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Only HTTP(S) media URLs without embedded credentials are supported")
    return url


def safe_headers(context):
    headers = {}
    for name, value in context.get("headers", {}).items():
        if name.lower() in ALLOWED_HEADERS and isinstance(value, str):
            if any(char in value for char in "\r\n\x00"):
                raise ValueError("Invalid request header")
            headers[name] = value
    return headers


def cookie_jar(context):
    jar = CookieJar()
    for item in context.get("cookies", []):
        name, value = item.get("name", ""), item.get("value", "")
        domain, path = item.get("domain", ""), item.get("path", "/")
        if not domain or any(c in str(name) + str(value) + str(domain) + str(path) for c in "\r\n\x00;"):
            continue
        expiry = item.get("expirationDate") or None
        jar.set_cookie(Cookie(0, name, value, None, False, domain, domain.startswith("."), domain.startswith("."),
                              path, True, bool(item.get("secure")), int(expiry) if expiry else None, not expiry, None, None, {}))
    return jar


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        old, new = urlsplit(req.full_url), urlsplit(newurl)
        if redirected and (old.scheme, old.netloc) != (new.scheme, new.netloc):
            for name in list(redirected.headers):
                if name.lower() in {"authorization", "cookie", "origin", "referer"}:
                    del redirected.headers[name]
        return redirected


def download_direct(job, destination, control, emit):
    context = job.get("requestContext", {})
    opener = build_opener(SafeRedirect(), HTTPCookieProcessor(cookie_jar(context)))
    request = Request(validate_url(job["mediaUrl"]), headers=safe_headers(context))
    with opener.open(request, timeout=20) as response, destination.open("wb") as output:
        content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
        if content_type.startswith("text/") or content_type in {"application/json", "application/vnd.apple.mpegurl", "application/x-mpegurl"}:
            raise ValueError("Response is not a direct media file")
        total = int(response.headers.get("Content-Length") or 0)
        received = 0
        while True:
            control.wait()
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            output.write(chunk)
            received += len(chunk)
            emit("JOB_PROGRESS", percent=min(95, received / total * 95) if total else 5,
                 bytesReceived=received, totalBytes=total, stage="Native downloading")
        control.wait()
        if not received or (total and received != total):
            raise ValueError("Incomplete or empty HTTP response")
        return {"ok": True, "bytes": received, "method": "http-length"}
