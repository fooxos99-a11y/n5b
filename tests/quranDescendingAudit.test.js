import assert from 'node:assert/strict';
import test from 'node:test';
import layout from '../server/data/quranVerseLineLayout.js';
import { selectExactQuranLinkRanges } from '../server/services/quranLinkRanges.js';
import { measureQuranFaces, buildQuranFacePositions } from '../server/services/quranFaceMeasurement.js';
import { up, down } from '../server/migrations/2026.09.28.1-descending-face-headings.js';

const ayahs = layout.map(([key, page]) => {
  const [surah, ayah] = key.split(':').map(Number);
  return { surah, ayah, page };
});
const position = (surah, ayah) => ayahs.find(row => row.surah === surah && row.ayah === ayah);
const range = (start, end) => ({ startSurah: start.surah, startAyah: start.ayah, startPage: start.page,
  endSurah: end.surah, endAyah: end.ayah, endPage: end.page });
const contains = (ranges, surah, ayah) => ranges.some(r => surah * 1000 + ayah >= r.startSurah * 1000 + r.startAyah
  && surah * 1000 + ayah <= r.endSurah * 1000 + r.endAyah);

test('all of page 604 is one face in either traversal direction', () => {
  assert.equal(measureQuranFaces(position(114, 1), position(112, 4)), 1);
  assert.equal(measureQuranFaces(position(112, 1), position(114, 6)), 1);
});

test('descending link includes the last nine verses of An-Naba and does not start at its final verse', () => {
  const selected = selectExactQuranLinkRanges({ ayahs, ranges: [range(position(78, 1), position(114, 6))],
    current: position(77, 1), direction: -1, targetFaces: 10 });
  for (let ayah = 1; ayah <= 40; ayah += 1) assert.ok(contains(selected, 78, ayah), `Missing 78:${ayah}`);
  assert.ok(!contains(selected, 77, 1));
  assert.ok(selected.reduce((sum, r) => sum + r.faces, 0) >= 9.5);
});

test('descending link includes Adh-Dhariyat 31-59 and clips current-surah future memorization', () => {
  const selected = selectExactQuranLinkRanges({ ayahs, ranges: [range(position(51, 1), position(56, 96))],
    current: position(50, 1), direction: -1, targetFaces: 10 });
  for (let ayah = 31; ayah <= 59; ayah += 1) assert.ok(contains(selected, 51, ayah));
  const partial = selectExactQuranLinkRanges({ ayahs, ranges: [range(position(78, 1), position(114, 6))],
    current: position(78, 31), direction: -1, targetFaces: 10 });
  assert.ok(contains(partial, 78, 30));
  for (let ayah = 31; ayah <= 40; ayah += 1) assert.ok(!contains(partial, 78, ayah));
});

test('ascending links and disjoint memorized spans never include a missing verse', () => {
  const ranges = [range(position(2, 1), position(2, 5)), range(position(2, 10), position(2, 20))];
  for (const direction of [1, -1]) {
    const selected = selectExactQuranLinkRanges({ ayahs, ranges, current: position(2, 21), direction, targetFaces: 10 });
    for (let ayah = 6; ayah <= 9; ayah += 1) assert.ok(!contains(selected, 2, ayah));
    assert.ok(contains(selected, 2, 20));
  }
});

test('face-position migration is reversible and changes only immutable reference positions', async () => {
  for (const [run, includeHeadings] of [[up, true], [down, false]]) {
    const values = [];
    await run({ query: async (sql, params) => {
      assert.match(sql, /INSERT INTO quran_face_positions/);
      assert.doesNotMatch(sql, /student_|DELETE|DROP/);
      values.push(...params);
    } });
    assert.deepEqual(values, buildQuranFacePositions({ includeHeadings }).flatMap(r => [r.surah, r.ayah, r.forwardStart, r.forwardEnd, r.reverseStart, r.reverseEnd]));
  }
});
