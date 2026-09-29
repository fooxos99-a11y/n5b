import json
import re
import urllib.parse
import urllib.request
from urllib.error import HTTPError


API_ROOT = "https://api.appstoreconnect.apple.com/v1"


ALLOWED_RESOURCES = frozenset({
    "apps", "appInfos", "appInfoLocalizations", "appStoreVersions",
    "appStoreVersionLocalizations", "reviewSubmissions", "reviewSubmissionItems",
})


def app_store_url(path):
    """Build a canonical Apple URL; reject traversal and encode each path segment."""
    if not isinstance(path, str) or any(char.isspace() or ord(char) < 32 or char in "\\\x7f" for char in path):
        raise ValueError("Invalid App Store Connect API path")
    parts = urllib.parse.urlsplit(path)
    if (parts.scheme or parts.netloc or parts.fragment
            or not re.fullmatch(r"/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+", parts.path)):
        raise ValueError("Invalid App Store Connect API path")
    segments = parts.path.lstrip("/").split("/")
    if segments[0] not in ALLOWED_RESOURCES:
        raise ValueError("Unsupported App Store Connect resource")
    encoded_path = "/" + "/".join(urllib.parse.quote(segment, safe="") for segment in segments)
    query = urllib.parse.urlencode(urllib.parse.parse_qsl(parts.query, keep_blank_values=True))
    return API_ROOT + encoded_path + ("?" + query if query else "")


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        """Never forward the bearer token through an upstream redirect."""
        raise ValueError("App Store Connect API redirects are not allowed")


def request_json(path, token, method="GET", payload=None):
    """Send JSON only to a validated Apple endpoint with a bounded timeout."""
    url = app_store_url(path)
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.build_opener(NoRedirects()).open(request, timeout=30) as response:
            if response.status == 204:
                return None
            return json.load(response)
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"App Store Connect returned HTTP {error.code}: {details}") from error
