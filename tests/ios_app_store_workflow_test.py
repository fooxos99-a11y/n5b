import os
import importlib.util
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import textwrap
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / '.github/workflows/ios-app-store-release.yml').read_text(encoding='utf-8')
RESOLVE = WORKFLOW.split('      - name: Resolve app release', 1)[1].split('      - name:', 1)[0]
SCRIPT = textwrap.dedent(re.search(r"python3 - <<'PY'\n(.*?)\n\s*PY", RESOLVE, re.S).group(1))
sys.path.insert(0, str(ROOT / 'scripts'))
with patch.dict(sys.modules, {'jwt': MagicMock()}):
    spec = importlib.util.spec_from_file_location('store_branding', ROOT / 'scripts/update-app-store-branding.py')
    branding = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(branding)


class AppStoreWorkflowTests(unittest.TestCase):
    def run_resolver(self, versions):
        with TemporaryDirectory(prefix='nukhab-ios-release-test-') as directory:
            root = Path(directory)
            project = root / 'ios/App/App.xcodeproj/project.pbxproj'
            project.parent.mkdir(parents=True)
            project.write_text('\n'.join('MARKETING_VERSION = ' + version + ';' for version in versions), encoding='utf-8')
            env_file = root / 'github-env'
            result = subprocess.run([sys.executable, '-c', SCRIPT], cwd=root,
                                    env={**os.environ, 'GITHUB_ENV': str(env_file)}, capture_output=True, text=True)
            return result, env_file.read_text(encoding='utf-8') if env_file.exists() else ''

    def test_reads_shared_project_version_instead_of_a_fixed_release(self):
        result, environment = self.run_resolver(['2.7.14', '2.7.14'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(environment, 'APP_VERSION=2.7.14\n')

    def test_conflicting_build_configurations_stop_before_submission(self):
        result, environment = self.run_resolver(['2.7.14', '2.7.15'])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(environment, '')

    def test_missing_version_stops_before_submission(self):
        result, environment = self.run_resolver([])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(environment, '')

    def test_existing_store_branding_and_description_are_preserved(self):
        self.assertIn('PRESERVE_EXISTING_STORE_DESCRIPTIONS: "true"', WORKFLOW)
        self.assertIn('skip_metadata(true)', WORKFLOW)
        self.assertIn('skip_screenshots(true)', WORKFLOW)


class StoreDescriptionTests(unittest.TestCase):
    def run_update(self, existing, preserve):
        writes = []

        def request(path, token, method='GET', payload=None):
            if method == 'PATCH':
                writes.append(payload)
                return {}
            if path.startswith('/apps/'):
                return {'data': [{'id': 'version', 'attributes': {'versionString': '2.7.14'}}]}
            return {'data': [{'id': 'arabic', 'attributes': {'locale': 'ar-SA', 'description': existing}}]}

        with patch.object(branding, 'request_json', side_effect=request), patch.dict(os.environ, {'PRESERVE_EXISTING_STORE_DESCRIPTIONS': str(preserve).lower()}):
            branding.update_version_metadata('app', 'mock-token', '2.7.14', 'برنامج نخب التعليمي', 'Nukhab', '')
        return writes

    def test_preserves_a_nonempty_existing_description(self):
        self.assertEqual(self.run_update('الوصف الحالي للجهة', True), [])

    def test_fills_a_missing_description_for_the_correct_product(self):
        writes = self.run_update('', True)
        self.assertEqual(writes[0]['data']['attributes'], {'description': 'برنامج نخب التعليمي'})

    def test_explicit_branding_update_retains_its_existing_behavior(self):
        writes = self.run_update('الوصف الحالي للجهة', False)
        self.assertEqual(writes[0]['data']['attributes'], {'description': 'برنامج نخب التعليمي'})


if __name__ == '__main__':
    unittest.main()
