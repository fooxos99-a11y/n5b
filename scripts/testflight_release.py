"""Verify one processed original-app build and reuse its existing internal group."""
import json
import os
import sys
import time
import urllib.parse
from pathlib import Path

from app_store_http import request_json


def query(resource, **filters):
    return resource + "?" + urllib.parse.urlencode(filters)


def prepare_build(app_id, version, number, group_id, request, sleep=time.sleep, attempts=30):
    for attempt in range(attempts):
        payload = request(query("/builds", **{
            "filter[app]": app_id, "filter[version]": number,
            "include": "preReleaseVersion,buildBetaDetail", "limit": 10,
        }))
        builds = payload.get("data", [])
        if len(builds) > 1:
            raise RuntimeError("Ambiguous TestFlight build; no group was changed")
        build = builds[0] if builds else None
        if build:
            included = {item["id"]: item for item in payload.get("included", [])}
            prerelease_id = build["relationships"]["preReleaseVersion"]["data"]["id"]
            if included[prerelease_id]["attributes"]["version"] != version:
                raise RuntimeError("TestFlight marketing version mismatch; no group was changed")
            state = build["attributes"]["processingState"]
            if state in {"FAILED", "INVALID"}:
                raise RuntimeError("Apple rejected build processing: " + state)
            if state == "VALID":
                break
        if attempt == attempts - 1:
            raise RuntimeError("TestFlight build is not processed; App Store submission stopped")
        sleep(30)

    groups = request(query("/betaGroups", **{
        "filter[app]": app_id, "filter[isInternalGroup]": "true", "limit": 200,
    })).get("data", [])
    group = next((item for item in groups if item["id"] == group_id), None)
    if not group or group["attributes"].get("isInternalGroup") is not True:
        raise RuntimeError("The configured existing internal group does not belong to this app")
    membership = query("/betaGroups", **{
        "filter[app]": app_id, "filter[builds]": build["id"],
        "filter[isInternalGroup]": "true", "limit": 200,
    })
    if not any(item["id"] == group_id for item in request(membership).get("data", [])):
        request(f"/betaGroups/{group_id}/relationships/builds", method="POST",
                payload={"data": [{"type": "builds", "id": build["id"]}]})
    if not any(item["id"] == group_id for item in request(membership).get("data", [])):
        raise RuntimeError("TestFlight group membership was not confirmed")
    details = request(f"/builds/{build['id']}/buildBetaDetail")["data"]["attributes"]
    if details.get("internalBuildState") != "IN_BETA_TESTING":
        raise RuntimeError("Build is not available for internal testing: " + str(details))
    return {"appId": app_id, "version": version, "buildNumber": number,
            "buildId": build["id"], "processingState": "VALID", "internalGroupId": group_id,
            "internalBuildState": details["internalBuildState"], "groupName": group["attributes"]["name"]}


def verify_submission(app_id, version, build_id, request):
    versions = request(query(f"/apps/{app_id}/appStoreVersions", **{
        "filter[platform]": "IOS", "include": "build", "limit": 10,
    })).get("data", [])
    current = next((item for item in versions if item["attributes"]["versionString"] == version), None)
    if not current or current["relationships"]["build"]["data"]["id"] != build_id:
        raise RuntimeError("App Store does not reference the verified TestFlight build")
    state = current["attributes"]["appStoreState"]
    if state not in {"WAITING_FOR_REVIEW", "IN_REVIEW", "PENDING_APPLE_RELEASE", "PENDING_DEVELOPER_RELEASE", "READY_FOR_SALE"}:
        raise RuntimeError("App Store submission was not confirmed: " + state)
    submissions = request(query(f"/apps/{app_id}/reviewSubmissions", **{
        "filter[platform]": "IOS", "limit": 20,
    })).get("data", [])
    matching = []
    for submission in submissions:
        items = request(f"/reviewSubmissions/{submission['id']}/items?limit=200").get("data", [])
        if any(item.get("relationships", {}).get("appStoreVersion", {}).get("data", {}).get("id") == current["id"] for item in items):
            matching.append({"id": submission["id"], "state": submission["attributes"]["state"]})
    return {"version": version, "versionId": current["id"], "buildId": build_id,
            "appStoreState": state, "releaseType": current["attributes"].get("releaseType"),
            "reviewSubmissions": matching}


def main():
    from app_store_auth import create_app_token, find_app_id
    token = create_app_token(os.environ["APPSTORE_API_KEY_ID"], os.environ["APPSTORE_ISSUER_ID"],
                             os.environ["APPSTORE_API_PRIVATE_KEY"])
    app_id = find_app_id(os.environ["APP_IDENTIFIER"], token)
    if "--verify-app-store" in sys.argv:
        build = json.loads(Path("testflight-release-status.json").read_text(encoding="utf-8"))
        result = verify_submission(app_id, os.environ["APP_VERSION"], build["buildId"],
                                   lambda path: request_json(path, token))
        Path("app-store-release-status.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result))
        return
    result = prepare_build(app_id, os.environ["APP_VERSION"], os.environ["TARGET_BUILD_NUMBER"],
                           os.environ["TESTFLIGHT_GROUP_ID"],
                           lambda path, **kwargs: request_json(path, token, **kwargs))
    Path("testflight-release-status.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
