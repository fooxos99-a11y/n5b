import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('iOS signing selects the exact app among prefix matches and rejects absent or ambiguous identities', () => {
  const script = fileURLToPath(new URL('../scripts/prepare-ios-push-profile.py', import.meta.url));
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', `
import runpy, sys, types
from pathlib import Path
sys.modules['jwt'] = types.ModuleType('jwt')
sys.path.insert(0, str(Path(sys.argv[1]).parent))
select = runpy.run_path(sys.argv[1], run_name='profile_test')['select_registered_bundle']
original = {'id': 'original', 'attributes': {'identifier': 'sa.nukhab.app'}}
preview = {'id': 'preview', 'attributes': {'identifier': 'sa.nukhab.app.preview'}}
assert select([preview, original], 'sa.nukhab.app') is original
assert select([original, preview], 'sa.nukhab.app.preview') is preview
for candidates in [[], [preview], [original, dict(original)]]:
    try:
        select(candidates, 'sa.nukhab.app')
    except RuntimeError:
        continue
    raise AssertionError('Absent or ambiguous identity must be rejected')
`, script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
