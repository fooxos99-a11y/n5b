import copy
import sys
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from testflight_release import prepare_build, verify_submission


class TestFlightReleaseTests(unittest.TestCase):
    def setUp(self):
        self.build = {"data": [{"id": "build-23", "attributes": {"processingState": "VALID"},
                     "relationships": {"preReleaseVersion": {"data": {"id": "version-19"}}}}],
                     "included": [{"id": "version-19", "attributes": {"version": "1.0.19"}}]}
        self.group = {"id": "existing-group", "attributes": {"name": "123", "isInternalGroup": True}}
        self.assigned = False
        self.writes = []
        self.waits = []

    def request(self, path, method="GET", payload=None):
        filters = parse_qs(urlsplit(path).query)
        if path.startswith("/builds?"):
            self.assertEqual(filters["filter[app]"], ["original-app"])
            self.assertEqual(filters["filter[version]"], ["23"])
            return copy.deepcopy(self.build)
        if method == "POST":
            self.assertEqual(path, "/betaGroups/existing-group/relationships/builds")
            self.assertEqual(payload, {"data": [{"type": "builds", "id": "build-23"}]})
            self.writes.append(path)
            self.assigned = True
            return None
        if path.endswith("/buildBetaDetail"):
            return {"data": {"attributes": {"internalBuildState": "IN_BETA_TESTING"}}}
        if "filter[builds]" in filters:
            self.assertNotIn("filter[app]", filters, "Apple permits only one relationship filter")
            self.assertEqual(filters["filter[builds]"], ["build-23"])
        else:
            self.assertEqual(filters["filter[app]"], ["original-app"])
        self.assertEqual(filters["filter[isInternalGroup]"], ["true"])
        return {"data": [self.group] if "filter[builds]" not in filters or self.assigned else []}

    def run_release(self, request=None, attempts=2):
        return prepare_build("original-app", "1.0.19", "23", "existing-group",
                             request or self.request, self.waits.append, attempts)

    def test_success_and_repeat_only_assign_existing_build_once(self):
        self.assertEqual(self.run_release()["internalBuildState"], "IN_BETA_TESTING")
        self.run_release()
        self.assertEqual(len(self.writes), 1)

    def test_marketing_version_mismatch_never_changes_group(self):
        self.build["included"][0]["attributes"]["version"] = "1.0.18"
        with self.assertRaisesRegex(RuntimeError, "version mismatch"):
            self.run_release()
        self.assertEqual(self.writes, [])

    def test_foreign_or_external_group_is_denied(self):
        self.group["attributes"]["isInternalGroup"] = False
        with self.assertRaisesRegex(RuntimeError, "does not belong"):
            self.run_release()
        self.assertEqual(self.writes, [])

    def test_processing_timeout_stops_submission_without_writes(self):
        self.build["data"][0]["attributes"]["processingState"] = "PROCESSING"
        with self.assertRaisesRegex(RuntimeError, "not processed"):
            self.run_release()
        self.assertEqual(self.waits, [30])
        self.assertEqual(self.writes, [])

    def test_failed_processing_does_not_retry_or_write(self):
        self.build["data"][0]["attributes"]["processingState"] = "INVALID"
        with self.assertRaisesRegex(RuntimeError, "rejected"):
            self.run_release()
        self.assertEqual(self.waits, [])
        self.assertEqual(self.writes, [])

    def test_permission_failure_propagates_and_blocks_submission(self):
        def denied(path, **kwargs):
            raise RuntimeError("Apple HTTP 403")
        with self.assertRaisesRegex(RuntimeError, "403"):
            self.run_release(denied)
        self.assertEqual(self.writes, [])

    def test_review_verification_rejects_wrong_build_and_draft_state(self):
        current = {"id": "version-19", "attributes": {"versionString": "1.0.19", "appStoreState": "WAITING_FOR_REVIEW"},
                   "relationships": {"build": {"data": {"id": "build-23"}}}}
        def request(path):
            if "appStoreVersions" in path:
                return {"data": [current]}
            return {"data": []}
        self.assertEqual(verify_submission("original-app", "1.0.19", "build-23", request)["appStoreState"], "WAITING_FOR_REVIEW")
        with self.assertRaisesRegex(RuntimeError, "does not reference"):
            verify_submission("original-app", "1.0.19", "wrong-build", request)
        current["attributes"]["appStoreState"] = "PREPARE_FOR_SUBMISSION"
        with self.assertRaisesRegex(RuntimeError, "not confirmed"):
            verify_submission("original-app", "1.0.19", "build-23", request)


if __name__ == "__main__":
    unittest.main()
