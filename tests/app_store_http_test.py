import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from app_store_http import app_store_url, request_json, NoRedirects


class AppStoreHttpTests(unittest.TestCase):
    def test_valid_paths_preserve_query_and_api_root(self):
        path = "/apps/123/appStoreVersions?filter%5BversionString%5D=1.0&limit=1"
        self.assertEqual(app_store_url(path), "https://api.appstoreconnect.apple.com/v1" + path)

    def test_rejects_traversal_and_foreign_destinations_before_network_access(self):
        paths = ["https://evil.test/apps", "//evil.test/apps", "/../apps", "/apps/../users",
                 "/apps/./users", "/apps/%2e%2e/users", "/apps/%252e%252e/users",
                 "/apps/a%2fb", "/apps\\users", "/apps#fragment", "/apps\n", "/apps//users", "/unknownResource", ""]
        with patch("app_store_http.urllib.request.build_opener") as opener:
            for path in paths:
                with self.subTest(path=path), self.assertRaises(ValueError):
                    request_json(path, "fixture-token")
            opener.assert_not_called()

    def test_json_request_uses_expected_method_payload_and_timeout(self):
        response = MagicMock()
        response.status = 200
        response.read.return_value = b'{"data": []}'
        with patch("app_store_http.urllib.request.build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value = response
            self.assertEqual(request_json("/appStoreVersions/abc-123", "fixture-token", "PATCH", {"data": {}}), {"data": []})
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.get_method(), "PATCH")
            self.assertEqual(request.data, b'{"data": {}}')
            self.assertEqual(opener.return_value.open.call_args.kwargs, {"timeout": 30})
            response.status = 204
            self.assertIsNone(request_json("/reviewSubmissionItems/abc-123", "fixture-token", "DELETE"))

    def test_redirects_are_rejected(self):
        handler = NoRedirects()
        response = io.BytesIO()
        with self.assertRaises(ValueError):
            handler.redirect_request(None, response, 302, "Found", {}, "https://evil.test")


if __name__ == "__main__":
    unittest.main()
