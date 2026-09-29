import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { readFile } from 'node:fs/promises';

test('web verification and release installs disable dependency lifecycle scripts', async () => {
  for (const name of ['verify.yml', 'web-deploy.yml']) {
    const workflow = await readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8');
    assert.match(workflow, /npm ci --ignore-scripts/);
    assert.doesNotMatch(workflow, /npm ci\s*\r?\n/);
  }
});

test('web deployment rejects unsafe artifacts and rolls back failed activation', () => {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['tests/webReleaseChecks.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
