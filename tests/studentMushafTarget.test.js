import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStudentMushafTarget } from '../src/lib/studentMushafTarget.js';
import { MUSHAF_DATA_VERSION, versionedMushafAsset } from '../shared/mushaf-package.js';

test('opens the actual QCF ayah page for a task and each disjoint passage', () => {
  const first = { page: 532, range: { fromSurah: 55, fromAyah: 17 } };
  const second = { page: 123, range: { fromSurah: 5, fromAyah: 90 } };
  const target = { ...first, ranges: [first, second] };
  const result = resolveStudentMushafTarget(target, { ayahs: [{ surah: 55, ayah: 17, page: 531 }, { surah: 5, ayah: 90, page: 122 }] });
  assert.equal(result.page, 531);
  assert.deepEqual(result.ranges.map((range) => range.page), [531, 122]);
  assert.equal(target.page, 532);
  assert.deepEqual(result.range, first.range);
});

test('retains page-only targets and handles a missing or hidden task', () => {
  assert.equal(resolveStudentMushafTarget(null, {}), null);
  assert.deepEqual(resolveStudentMushafTarget({ page: 22 }, {}), { page: 22 });
});

test('corrected Mushaf data bypasses the old HTTP cache while keeping unchanged fonts cached', () => {
  assert.equal(versionedMushafAsset('quran/hafs/index.json'), `quran/hafs/index.json?v=${MUSHAF_DATA_VERSION}`);
  assert.equal(versionedMushafAsset('quran/hafs/pages/531.json'), `quran/hafs/pages/531.json?v=${MUSHAF_DATA_VERSION}`);
  assert.equal(versionedMushafAsset('quran/hafs/fonts/p531.woff2'), 'quran/hafs/fonts/p531.woff2');
});
