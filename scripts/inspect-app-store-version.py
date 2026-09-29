import json
import os
import time
import urllib.parse

from app_store_auth import create_app_token, find_app_id
from app_store_review_state import wait_for_review_cancellation
from app_store_http import request_json


def ensure_release_notes(app_id, version_id, token, retry_state_transition=False):
    """Ensure localized release notes exist, preserving notes when Apple keeps them locked."""
    arabic_notes = os.environ["APP_RELEASE_NOTES_AR"]
    english_notes = os.environ["APP_RELEASE_NOTES_EN"]
    localization_query = urllib.parse.urlencode(
        {"fields[appStoreVersionLocalizations]": "locale,whatsNew", "limit": 200}
    )
    localizations = request_json(
        f"/appStoreVersions/{version_id}/appStoreVersionLocalizations?{localization_query}",
        token,
    ).get("data", [])

    if not localizations:
        app = request_json(f"/apps/{app_id}?fields[apps]=primaryLocale", token)["data"]
        locale = app.get("attributes", {}).get("primaryLocale") or "en-US"
        created = request_json(
            "/appStoreVersionLocalizations",
            token,
            method="POST",
            payload={
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "attributes": {
                        "locale": locale,
                        "whatsNew": arabic_notes if locale.lower().startswith("ar") else english_notes,
                    },
                    "relationships": {
                        "appStoreVersion": {
                            "data": {"type": "appStoreVersions", "id": version_id}
                        }
                    },
                }
            },
        )
        localizations = [created["data"]]

    for localization in localizations:
        locale = localization.get("attributes", {}).get("locale", "")
        desired = arabic_notes if locale.lower().startswith("ar") else english_notes
        if localization.get("attributes", {}).get("whatsNew") == desired:
            continue
        localization_id = localization["id"]
        notes_updated = patch_release_notes(localization_id, desired, token, retry_state_transition)

        if notes_updated:
            print(f"Updated App Store release notes for {locale}.")


def main():
    """Apply only the release operations explicitly selected through environment flags."""
    key_id = os.environ["APPSTORE_API_KEY_ID"]
    issuer_id = os.environ["APPSTORE_ISSUER_ID"]
    private_key = os.environ["APPSTORE_API_PRIVATE_KEY"]
    bundle_id = os.environ["APP_IDENTIFIER"]
    token = create_app_token(key_id, issuer_id, private_key)
    app_id = find_app_id(bundle_id, token)
    version_query = urllib.parse.urlencode(
        {
            "filter[platform]": "IOS",
            "include": "build",
            "limit": 10,
        }
    )
    payload = request_json(f"/apps/{app_id}/appStoreVersions?{version_query}", token)
    builds = {
        item["id"]: item.get("attributes", {})
        for item in payload.get("included", [])
        if item.get("type") == "builds"
    }

    print(f"App Store status for {bundle_id}:")
    versions = payload.get("data", [])
    print_version_status(versions, builds)

    if os.environ.get("REPLACE_READY_FOR_REVIEW_BUILD") != "true":
        return

    version_string = os.environ["APP_VERSION"]
    target_build_number = os.environ["TARGET_BUILD_NUMBER"]
    target_version = next(
        (
            version
            for version in versions
            if version.get("attributes", {}).get("versionString") == version_string
        ),
        None,
    )
    replaceable_states = {"READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW"}
    rename_existing_version = False
    if not target_version:
        target_version = next(
            (
                version
                for version in versions
                if version.get("attributes", {}).get("appStoreState")
                in replaceable_states
            ),
            None,
        )
        if target_version:
            current_version_string = target_version.get("attributes", {}).get(
                "versionString"
            )
            rename_existing_version = True
            print(
                f"Will reopen editable App Store version {current_version_string} "
                f"and update it to {version_string}."
            )

    if not target_version:
        if os.environ.get("CREATE_VERSION_IF_MISSING") != "true":
            print(f"No existing App Store version {version_string}; no draft item to replace.")
            return
        created = request_json(
            "/appStoreVersions",
            token,
            method="POST",
            payload={
                "data": {
                    "type": "appStoreVersions",
                    "attributes": {
                        "platform": "IOS",
                        "versionString": version_string,
                    },
                    "relationships": {
                        "app": {"data": {"type": "apps", "id": app_id}}
                    },
                }
            },
        )
        target_version = created["data"]
        print(f"Created editable App Store version {version_string}.")

    attributes = target_version.get("attributes", {})
    current_state = attributes.get("appStoreState")
    current_version_string = attributes.get("versionString")
    if current_state not in replaceable_states:
        ensure_release_notes(
            app_id,
            target_version["id"],
            token,
            retry_state_transition=current_state == "DEVELOPER_REJECTED",
        )
        print(
            f"Version {current_version_string} is {current_state}; "
            "no replaceable review submission was found."
        )
        return

    build_link = target_version.get("relationships", {}).get("build", {}).get("data")
    current_build = builds.get(build_link.get("id"), {}) if build_link else {}
    reopen_for_metadata = os.environ.get("REOPEN_FOR_METADATA") == "true"
    if str(current_build.get("version")) == target_build_number and not reopen_for_metadata:
        print(f"Version {version_string} already uses build {target_build_number}.")
        return

    version_id = target_version["id"]
    matching_items, matching_submissions, submission_states = find_version_review_items(app_id, version_id, token)

    if not matching_items:
        raise RuntimeError(
            f"Version {version_string} is {current_state} but its review submission item "
            f"was not found; submission states: {submission_states}"
        )

    reopen_review_submission(matching_submissions, matching_items, current_state, current_build, version_string, token)

    wait_until_editable(app_id, version_id, version_string, current_version_string, rename_existing_version, token)



def patch_release_notes(localization_id, desired, token, retry_state_transition):
    """Retry only documented metadata-transition conflicts within a bounded budget."""
    attempts = 12 if retry_state_transition else 1
    notes_updated = False
    for attempt in range(attempts):
        try:
            request_json(
                f"/appStoreVersionLocalizations/{localization_id}",
                token,
                method="PATCH",
                payload={
                    "data": {
                        "type": "appStoreVersionLocalizations",
                        "id": localization_id,
                        "attributes": {"whatsNew": desired},
                    }
                },
            )
            notes_updated = True
            break
        except RuntimeError as error:
            state_is_transitioning = (
                "HTTP 409" in str(error)
                and "whatsNew" in str(error)
            )
            if not retry_state_transition or not state_is_transitioning:
                raise
            if attempt == attempts - 1:
                print(
                    "App Store release notes are still locked after the review "
                    "transition; continuing with the existing notes."
                )
                break
            print("App Store metadata is still transitioning; retrying in 10 seconds.")
            time.sleep(10)
    return notes_updated


def print_version_status(versions, builds):
    """Print version and build status without changing App Store state."""
    for version in versions:
        attributes = version.get("attributes", {})
        build_link = version.get("relationships", {}).get("build", {}).get("data")
        build = builds.get(build_link.get("id"), {}) if build_link else {}
        print(
            json.dumps(
                {
                    "version": attributes.get("versionString"),
                    "state": attributes.get("appStoreState"),
                    "build": build.get("version"),
                    "buildProcessingState": build.get("processingState"),
                },
                ensure_ascii=False,
            )
        )


def find_version_review_items(app_id, version_id, token):
    """Find only review submission items that belong to the selected version."""
    submission_query = urllib.parse.urlencode(
        {
            "filter[platform]": "IOS",
            "fields[reviewSubmissions]": "state,items",
            "limit": 20,
        }
    )
    submissions = request_json(
        f"/apps/{app_id}/reviewSubmissions?{submission_query}", token
    )
    matching_items = []
    matching_submissions = []
    submission_states = []
    item_query = urllib.parse.urlencode(
        {
            "include": "appStoreVersion",
            "fields[reviewSubmissionItems]": "state,appStoreVersion",
            "fields[appStoreVersions]": "versionString,appStoreState",
            "limit": 200,
        }
    )
    for submission in submissions.get("data", []):
        submission_state = submission.get("attributes", {}).get("state")
        submission_states.append(submission_state)
        items = request_json(
            f"/reviewSubmissions/{submission['id']}/items?{item_query}", token
        )
        submission_items = [
            item
            for item in items.get("data", [])
            if item.get("relationships", {})
            .get("appStoreVersion", {})
            .get("data", {})
            .get("id")
            == version_id
        ]
        if submission_items:
            matching_items.extend(submission_items)
            matching_submissions.append(submission)
    return matching_items, matching_submissions, submission_states


def reopen_review_submission(matching_submissions, matching_items, current_state, current_build, version_string, token):
    """Cancel only matching active reviews, or detach their ready-for-review draft items."""
    if current_state in {"WAITING_FOR_REVIEW", "IN_REVIEW"}:
        canceled_submission_ids = []
        cancellable_submission_states = {
            "READY_FOR_REVIEW",
            "WAITING_FOR_REVIEW",
            "IN_REVIEW",
        }
        for submission in matching_submissions:
            submission_state = submission.get("attributes", {}).get("state")
            if submission_state not in cancellable_submission_states:
                print(
                    f"Skipped review submission {submission['id']} in non-cancellable "
                    f"state {submission_state}."
                )
                continue
            submission_id = submission["id"]
            request_json(
                f"/reviewSubmissions/{submission_id}",
                token,
                method="PATCH",
                payload={
                    "data": {
                        "type": "reviewSubmissions",
                        "id": submission_id,
                        "attributes": {"canceled": True},
                    }
                },
            )
            print(
                f"Canceled the {current_state} review submission containing build "
                f"{current_build.get('version')} for version {version_string}."
            )
            canceled_submission_ids.append(submission_id)
        wait_for_review_cancellation(
            canceled_submission_ids,
            lambda path: request_json(path, token),
            time.sleep,
        )
    else:
        for item in matching_items:
            request_json(f"/reviewSubmissionItems/{item['id']}", token, method="DELETE")
            print(
                f"Removed build {current_build.get('version')} from the READY_FOR_REVIEW "
                f"draft for version {version_string}."
            )


def wait_until_editable(app_id, version_id, version_string, current_version_string, rename_existing_version, token):
    """Wait for Apple to confirm editability before renaming or changing release notes."""
    for _ in range(18):
        time.sleep(10)
        refreshed = request_json(f"/appStoreVersions/{version_id}", token)
        refreshed_state = refreshed.get("data", {}).get("attributes", {}).get(
            "appStoreState"
        )
        print(f"Version {version_string} state after review replacement: {refreshed_state}")
        if refreshed_state in {"PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED"}:
            if rename_existing_version:
                request_json(
                    f"/appStoreVersions/{version_id}",
                    token,
                    method="PATCH",
                    payload={
                        "data": {
                            "type": "appStoreVersions",
                            "id": version_id,
                            "attributes": {"versionString": version_string},
                        }
                    },
                )
                print(
                    f"Updated editable App Store version from "
                    f"{current_version_string} to {version_string}."
                )
            ensure_release_notes(app_id, version_id, token, retry_state_transition=True)
            return

    raise RuntimeError(
        f"Version {version_string} did not become editable after review replacement"
    )

if __name__ == "__main__":
    main()
