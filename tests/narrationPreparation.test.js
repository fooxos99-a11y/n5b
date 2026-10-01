import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNarrationRanges, prepareNarrationAssignments } from '../server/services/narrationPreparation.js';

const range = { startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7 };
const dependencies = {
  readAyah: async (surah, ayah) => surah === 1 && ayah <= 7 ? { page: 1 } : null,
  mergeRanges: async ranges => ranges,
  measureFaces: async () => 1,
};
test('manual narration derives pages and faces from references, independent of memorization', async () => {
  const result = await prepareNarrationAssignments('manual', [{ studentId: 9, ranges: [{ ...range, startPage: 999, faces: 999 }] }], [{ id: 9 }], dependencies);
  assert.deepEqual(result.get(9), [{ ...range, startPage: 1, endPage: 1, faces: 1 }]);
  assert.equal(await prepareNarrationAssignments(undefined, null, [], dependencies), null);
  assert.equal(await prepareNarrationAssignments('full', null, [], dependencies), null);
});
test('manual narration rejects unavailable students, duplicate students, and missing excerpts', async () => {
  await assert.rejects(prepareNarrationAssignments('manual', [{ studentId: 10, ranges: [range] }], [{ id: 9 }], dependencies), { statusCode: 403 });
  await assert.rejects(prepareNarrationAssignments('manual', [{ studentId: 9, ranges: [range] }, { studentId: 9, ranges: [range] }], [{ id: 9 }, { id: 10 }], dependencies), { statusCode: 422 });
  for (const assignments of [[], null, [{ studentId: 9, ranges: [] }]]) await assert.rejects(prepareNarrationAssignments('manual', assignments, [{ id: 9 }], dependencies), { statusCode: 422 });
  await assert.rejects(prepareNarrationAssignments('other', [], [], dependencies), { statusCode: 422 });
});
test('manual Quran references reject missing, reversed, fractional, nonexistent, and excessive ranges', async () => {
  for (const ranges of [[null], [{ ...range, startAyah: 8 }], [{ ...range, endAyah: 8 }], [{ ...range, startAyah: 1.5 }], [{ ...range, startSurah: 115 }], Array(31).fill(range)]) {
    await assert.rejects(normalizeNarrationRanges(ranges, dependencies), { statusCode: 422 });
  }
});
