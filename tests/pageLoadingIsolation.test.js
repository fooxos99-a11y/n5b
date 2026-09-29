import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('packaged Mushaf does not block on unrelated workspace preparation', async () => {
  const mushaf = await readFile(new URL('../src/components/portal/StudentMushafSection.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(mushaf, /await studentsApi.getStudentQuranToday/);
  assert.match(mushaf, /void studentsApi.getStudentQuranToday/);
  assert.match(mushaf, /await getOfflineMushafIndex/);
});
