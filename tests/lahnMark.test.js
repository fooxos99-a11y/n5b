import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeWordMarkType } from '../server/services/recitationMarks.js';
import { isMistakeMark, RECITATION_MARK_LABELS } from '../shared/recitation-mark-types.js';
import { up } from '../server/migrations/2026.09.27.1-lahn-mark-type.js';

test('«لحن» is its own mark type and is graded like a mistake', async () => {
  assert.equal(normalizeWordMarkType({ markType: 'lahn' }), 'lahn');
  assert.equal(normalizeWordMarkType({ markType: 'other' }), null);
  assert.ok(isMistakeMark('lahn') && isMistakeMark('mistake') && !isMistakeMark('warning'));
  assert.equal(RECITATION_MARK_LABELS.lahn, 'لحن');
  const calls = [];
  await up({ query: async (sql) => calls.push(sql) });
  assert.match(calls[0], /ENUM\('mistake', 'warning', 'lahn'\)/);
  const [dialog, server, page] = await Promise.all([
    readFile(new URL('../src/components/portal/MushafWordMarkDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MadaniMushafPage.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(dialog, /onClick=\{\(\) => save\('lahn'\)\}[\s\S]*لحن/);
  assert.match(page, /mark\?\.markType === 'lahn'/);
  assert.doesNotMatch(server, /markType === 'mistake'\)\.length/);
});
