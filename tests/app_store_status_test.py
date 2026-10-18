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
            if '/buildUploads?' in resource:
                return {'data': [{'id': 'upload', 'attributes': {'cfBundleVersion': '29', 'cfBundleShortVersionString': '1.0.21',
                                  'state': {'state': 'FAILED', 'errors': [{'code': 'mock', 'description': 'Test validation error'}]}}}]}
            return {'data': [{'id': 'version', 'attributes': {'versionString': '1.0.21', 'appStoreState': 'WAITING_FOR_REVIEW'},
                              'relationships': {'build': {'data': {'id': 'old-build'}}}}]}

        result = status.read_status('original-app', request)
        self.assertEqual(len(calls), 3)
        self.assertIn('filter%5Bapp%5D=original-app', calls[0])
        self.assertTrue(calls[1].startswith('/apps/original-app/appStoreVersions?'))
        self.assertTrue(calls[2].startswith('/apps/original-app/buildUploads?'))
        self.assertEqual(result['builds'][0]['processingState'], 'PROCESSING')
        self.assertEqual(result['builds'][0]['version'], '1.0.21')
        self.assertEqual(result['versions'][0]['buildId'], 'old-build')
        self.assertEqual(result['uploads'][0]['number'], '29')
        self.assertEqual(result['uploads'][0]['state']['errors'][0]['description'], 'Test validation error')

    def test_missing_build_is_reported_as_absent_without_inventing_a_processing_state(self):
        result = status.read_status('original-app', lambda resource: {'data': []})
        self.assertEqual(result['builds'], [])
        self.assertEqual(result['versions'], [])
        self.assertEqual(result['uploads'], [])


class AppleProcessingWaitTests(unittest.TestCase):
    def snapshot(self, state):
        return {'appId': 'original-app', 'builds': [{'id': 'build', 'number': '29', 'processingState': 'VALID'}] if state == 'COMPLETE' else [],
                'versions': [], 'uploads': [{'id': 'upload', 'number': '29', 'state': {'state': state}}]}

    def test_processing_waits_then_returns_the_ready_build(self):
        sleep = MagicMock()
        progress = MagicMock()
        with patch.object(status, 'read_status', side_effect=[self.snapshot('PROCESSING'), self.snapshot('COMPLETE')]):
            result = status.wait_for_build('original-app', '29', MagicMock(), sleep=sleep, attempts=2, on_status=progress)
        self.assertEqual(result['builds'][0]['processingState'], 'VALID')
        sleep.assert_called_once_with(60)
        self.assertEqual(progress.call_count, 2)

    def test_failed_upload_stops_without_waiting_or_changing_review(self):
        sleep = MagicMock()
        with patch.object(status, 'read_status', return_value=self.snapshot('FAILED')):
            with self.assertRaisesRegex(RuntimeError, 'rejected'):
                status.wait_for_build('original-app', '29', MagicMock(), sleep=sleep)
        sleep.assert_not_called()

    def test_timeout_keeps_processing_distinct_from_success(self):
        with patch.object(status, 'read_status', return_value=self.snapshot('PROCESSING')):
            with self.assertRaisesRegex(RuntimeError, 'existing review remains unchanged'):
                status.wait_for_build('original-app', '29', MagicMock(), sleep=MagicMock(), attempts=1)


if __name__ == '__main__':
    unittest.main()
