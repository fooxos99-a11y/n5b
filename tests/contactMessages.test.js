import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Nukhab development preview shows ranking samples without affecting production data', async () => {
  const rankings = await readFile(new URL('../src/components/public/nukhab/NukhabPublicRankings.jsx', import.meta.url), 'utf8');
  assert.match(rankings, /import\.meta\.env\.DEV && rows\.length === 0/);
  assert.match(rankings, /demoStudents/);
  assert.match(rankings, /demoFamilies/);
});
