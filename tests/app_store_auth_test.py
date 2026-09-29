import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
with patch.dict(sys.modules, {"jwt": MagicMock()}):
    import app_store_auth


class AppStoreAuthTests(unittest.TestCase):
    def test_token_preserves_expiry_algorithm_and_key_id(self):
        with patch.object(app_store_auth.time, "time", return_value=1000), patch.object(
            app_store_auth.jwt, "encode", return_value="test-token"
        ) as encode:
            self.assertEqual(app_store_auth.create_app_token("key", "issuer", "test-key"), "test-token")
        encode.assert_called_once_with(
            {"iss": "issuer", "iat": 1000, "exp": 2200, "aud": "appstoreconnect-v1"},
            "test-key", algorithm="ES256", headers={"kid": "key", "typ": "JWT"},
        )

    def test_lookup_encodes_bundle_and_returns_app_id(self):
        with patch.object(app_store_auth, "request_json", return_value={"data": [{"id": "42"}]}) as request:
            self.assertEqual(app_store_auth.find_app_id("test.app&other", "token"), "42")
        request.assert_called_once_with("/apps?filter%5BbundleId%5D=test.app%26other&limit=1", "token")

    def test_missing_app_is_rejected(self):
        with patch.object(app_store_auth, "request_json", return_value={"data": []}):
            with self.assertRaisesRegex(RuntimeError, "App not found"):
                app_store_auth.find_app_id("test.app", "token")


if __name__ == "__main__":
    unittest.main()
