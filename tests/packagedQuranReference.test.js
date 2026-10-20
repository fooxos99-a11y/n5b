import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPackagedQuranReference, readPackagedQuranReference } from '../server/services/packagedQuranReference.js';
import layout from '../server/data/quranVerseLineLayout.js';

test('all 604 displayed pages and 6236 verse coordinates agree with the planning reference', async () => {
  const actual = await readPackagedQuranReference();
  const stored = JSON.parse(await readFile(new URL('../server/data/quran-pages.json', import.meta.url), 'utf8'));
  assert.deepEqual(actual.reference, stored);
  assert.deepEqual(actual.layout, layout);
  assert.equal(actual.layout.length, 6236);
  assert.deepEqual(actual.layout.find(row => row[0] === '6:131').slice(1, 4), [145, 1, 145]);
  for (const [verse, page] of [['80:41', 586], ['83:5', 588], ['89:23', 594]]) {
    assert.equal(actual.reference.ayahs.find(row => `${row.surah}:${row.ayah}` === verse).page, page);
  }
});

test('an incomplete package is rejected before replacing reference files', () => {
  assert.throws(() => buildPackagedQuranReference([], { ayahs: [], chapters: [] }), /Incomplete/);
});
