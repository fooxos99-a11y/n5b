"""Shared App Store Connect authentication and exact bundle lookup."""
import time
import urllib.parse

import jwt
from app_store_http import request_json


def create_app_token(key_id, issuer_id, private_key):
    now = int(time.time())
    return jwt.encode(
        {"iss": issuer_id, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
        private_key,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


def find_app_id(bundle_id, token):
    query = urllib.parse.urlencode({"filter[bundleId]": bundle_id, "limit": 1})
    apps = request_json(f"/apps?{query}", token).get("data", [])
    if not apps:
        raise RuntimeError(f"App not found for bundle ID {bundle_id}")
    return apps[0]["id"]
