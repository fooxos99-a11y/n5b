import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalQuranRange, canonicalQuranRow, quranFacePortion, taskFaceQuantity } from '../server/services/quranPageReference.js';
import { findNextUnmemorizedPosition } from '../server/services/quranMemorizationContinuity.js';
import { readPackagedQuranReference } from '../server/services/packagedQuranReference.js';
import { buildForwardQuranFaceRange } from '../shared/quran-face-range.js';
import { formatContinuousRecitationRange } from '../src/lib/recitationTaskRanges.js';
import { planTaskAmount } from '../src/lib/studentPlan.js';

const range = (from, to) => ({ fromSurah: 6, fromAyah: from, toSurah: 6, toAyah: to, fromPage: 145, toPage: 145 });

test('a complete face, a remainder, and an intentionally partial face have distinct quantities', () => {
  assert.equal(quranFacePortion(range(131, 137)), null);
  assert.equal(quranFacePortion(range(132, 137)), 'remainder');
  assert.equal(quranFacePortion(range(132, 135)), 'partial');
  assert.equal(taskFaceQuantity(range(132, 137), 1, 1), 0.75);
  assert.equal(taskFaceQuantity(range(131, 137), 1, 1), 1);
  assert.equal(taskFaceQuantity(range(132, 135), 0.5, 0.5), 0.5);
  assert.equal(quranFacePortion({ fromSurah: 40, fromAyah: 1, toSurah: 40, toAyah: 7 }), 'remainder');
  const descending = { fromSurah: 114, fromAyah: 1, toSurah: 112, toAyah: 4 };
  assert.equal(quranFacePortion(descending), null, 'A complete face stays complete in descending-surah plans');
  assert.equal(taskFaceQuantity(descending, 1, 1), 1);
  assert.equal(quranFacePortion({ ...descending, fromSurah: 113 }), 'remainder');
});

test('accepted ayahs retain their identity when an old page coordinate crosses the corrected boundary', () => {
  const old = { startPage: 144, startSurah: 6, startAyah: 125, endPage: 144, endSurah: 6, endAyah: 131 };
  const canonical = canonicalQuranRange(old);
  assert.equal(canonical.endPage, 145);
  assert.equal(canonical.endAyah, 131);
  assert.equal(old.endPage, 144);
  assert.equal(canonicalQuranRow({ fromPage: 144, fromSurah: 6, fromAyah: 131 }).fromPage, 145);
});

test('day boundaries include the missing first ayah but never repeat an already accepted first ayah', async () => {
  const { reference } = await readPackagedQuranReference();
  const ayahs = reference.ayahs;
  const start = { page: 144, surah: 6, ayah: 125 }, end = { page: 146, surah: 6, ayah: 142 };
  const accepted = last => canonicalQuranRange({ startPage: 144, startSurah: 6, startAyah: 125, endPage: 144, endSurah: 6, endAyah: last });
  for (const last of [130, 131, 137]) {
    const next = findNextUnmemorizedPosition({ ayahs, ranges: [accepted(last)], start, end });
    assert.equal(next.ayah, last + 1);
    assert.equal(next.page, last === 137 ? 146 : 145);
  }
  const next = { page: 145, surah: 6, ayah: 131 };
  const firstDay = await buildForwardQuranFaceRange({ start: next, endLimit: end, targetFaces: 1,
    getPageEnd: async () => ({ page: 145, surah: 6, ayah: 137 }),
    getNextPosition: async () => ({ page: 146, surah: 6, ayah: 138 }) });
  assert.equal(firstDay.start.ayah, 131);
  assert.equal(firstDay.end.ayah, 137);
});

test('student and teacher amounts label a remainder without merging it into a complete neighboring face', () => {
  const task = { ...range(132, 137), facePortion: 'remainder', fromSurahName: 'الأنعام', toSurahName: 'الأنعام' };
  assert.match(planTaskAmount(task), /^بقية وجه:/);
  assert.match(formatContinuousRecitationRange([task]), /^بقية وجه:/);
  assert.match(formatContinuousRecitationRange([task], 'page'), /بقية وجه/);
  assert.equal(planTaskAmount({ ...task, amountHidden: true }), '');
});
