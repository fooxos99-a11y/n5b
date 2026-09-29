"""Install an App Store profile with push support without revoking existing profiles."""

import base64
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import subprocess
import time
import urllib.parse

import jwt

spec = importlib.util.spec_from_file_location(
    "app_store_api", Path(__file__).with_name("inspect-app-store-version.py")
)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def decode_profile(profile):
    content = base64.b64decode(profile["attributes"]["profileContent"], validate=True)
    result = subprocess.run(
        ["security", "cms", "-D"], input=content, capture_output=True, check=True
    )
    return content, plistlib.loads(result.stdout)


def main():
    identifier = os.environ["APP_IDENTIFIER"]
    original_name = os.environ["APP_PROVISIONING_PROFILE"]
    profile_name = original_name + " Push"
    now = int(time.time())
    token = jwt.encode(
        {"iss": os.environ["APPSTORE_ISSUER_ID"], "iat": now,
         "exp": now + 1200, "aud": "appstoreconnect-v1"},
        os.environ["APPSTORE_API_PRIVATE_KEY"], algorithm="ES256",
        headers={"kid": os.environ["APPSTORE_API_KEY_ID"], "typ": "JWT"},
    )
    query = urllib.parse.urlencode({"filter[identifier]": identifier})
    bundles = api.request_json("/bundleIds?" + query, token)["data"]
    if len(bundles) != 1 or bundles[0]["attributes"]["identifier"] != identifier:
        raise RuntimeError("Expected one matching registered bundle ID")
    bundle_id = bundles[0]["id"]
    capabilities = api.request_json(
        f"/bundleIds/{bundle_id}/bundleIdCapabilities", token
    )["data"]
    if not any(c["attributes"]["capabilityType"] == "PUSH_NOTIFICATIONS" for c in capabilities):
        api.request_json("/bundleIdCapabilities", token, "POST", {"data": {
            "type": "bundleIdCapabilities",
            "attributes": {"capabilityType": "PUSH_NOTIFICATIONS"},
            "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_id}}},
        }})
        print("Enabled push capability for", identifier)

    query = urllib.parse.urlencode({"filter[name]": profile_name,
                                  "filter[profileType]": "IOS_APP_STORE", "limit": 200})
    profiles = api.request_json("/profiles?" + query, token)["data"]
    matching = [p for p in profiles if p["attributes"]["name"] == profile_name
                and p["attributes"]["profileState"] == "ACTIVE"]
    if len(matching) > 1:
        raise RuntimeError("Ambiguous push provisioning profile")
    if matching:
        profile = matching[0]
    else:
        query = urllib.parse.urlencode({"filter[name]": original_name,
                                      "filter[profileType]": "IOS_APP_STORE", "limit": 200})
        originals = api.request_json("/profiles?" + query, token)["data"]
        originals = [p for p in originals if p["attributes"]["name"] == original_name]
        if len(originals) != 1:
            raise RuntimeError("Expected one existing distribution profile")
        original = originals[0]
        linked_bundle = api.request_json(f"/profiles/{original['id']}/bundleId", token)["data"]
        if linked_bundle["id"] != bundle_id:
            raise RuntimeError("Distribution profile belongs to another app")
        certificates = api.request_json(f"/profiles/{original['id']}/certificates", token)["data"]
        profile = api.request_json("/profiles", token, "POST", {"data": {
            "type": "profiles", "attributes": {"name": profile_name, "profileType": "IOS_APP_STORE"},
            "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": bundle_id}},
                "certificates": {"data": [{"type": "certificates", "id": c["id"]} for c in certificates]},
            },
        }})["data"]
        print("Created push distribution profile for", identifier)

    content, decoded = decode_profile(profile)
    entitlements = decoded["Entitlements"]
    if (entitlements.get("aps-environment") != "production"
            or entitlements.get("application-identifier") != os.environ["APPLE_TEAM_ID"] + "." + identifier):
        raise RuntimeError("Provisioning profile does not match app and production push entitlements")
    directory = Path.home() / "Library/MobileDevice/Provisioning Profiles"
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / (decoded["UUID"] + ".mobileprovision")
    destination.write_bytes(content)
    destination.chmod(0o600)
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as output:
        output.write("APP_PUSH_PROVISIONING_PROFILE=" + profile_name + "\n")
    print(json.dumps({"bundleId": identifier, "profile": profile_name, "push": "production"}))


if __name__ == "__main__":
    main()
