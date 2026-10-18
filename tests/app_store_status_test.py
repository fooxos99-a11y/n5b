import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
with patch.dict(sys.modules, {'jwt': MagicMock()}):
    spec = importlib.util.spec_from_file_location('apple_status', ROOT / 'scripts/read-app-store-status.py')
    status = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(status)


class AppleStatusTests(unittest.TestCase):
    def test_reads_only_the_selected_app_and_distinguishes_processing_from_review(self):
        calls = []

        def request(resource):
            calls.append(resource)
            if resource.startswith('/builds?'):
                return {'data': [{'id': 'build', 'attributes': {'version': '29', 'processingState': 'PROCESSING'},
                                 'relationships': {'preReleaseVersion': {'data': {'id': 'release'}}}}],
                        'included': [{'type': 'preReleaseVersions', 'id': 'release', 'attributes': {'version': '1.0.21'}}]}
            return {'data': [{'id': 'version', 'attributes': {'versionString': '1.0.21', 'appStoreState': 'WAITING_FOR_REVIEW'},
                              'relationships': {'build': {'data': {'id': 'old-build'}}}}]}

        result = status.read_status('original-app', request)
        self.assertEqual(len(calls), 2)
        self.assertIn('filter%5Bapp%5D=original-app', calls[0])
        self.assertTrue(calls[1].startswith('/apps/original-app/appStoreVersions?'))
        self.assertEqual(result['builds'][0]['processingState'], 'PROCESSING')
        self.assertEqual(result['builds'][0]['version'], '1.0.21')
        self.assertEqual(result['versions'][0]['buildId'], 'old-build')

    def test_missing_build_is_reported_as_absent_without_inventing_a_processing_state(self):
        result = status.read_status('original-app', lambda resource: {'data': []})
        self.assertEqual(result['builds'], [])
        self.assertEqual(result['versions'], [])


if __name__ == '__main__':
    unittest.main()
