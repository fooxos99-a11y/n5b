import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewCycle, selectReviewFaces } from '../shared/quran-review-cycle.js';
import { selectAuthorizedReview, saveReviewCycle } from '../server/services/quranReviewCycle.js';
import { reviewStartFromHistory } from '../server/services/quranReviewSchedule.js';
import { studentVisibleToday } from '../shared/student-amount-visibility.js';

const ayahs = [78, 79, 80, 114].flatMap((surah, page) => [1, 2].map(ayah => ({ surah, ayah, page: page + 1 })));
const cycle = buildReviewCycle({ ayahs, start: ayahs[4], direction: -1, isAvailable: () => true });
test('reverse review continues Abasa to Naba then wraps to Nas with verses forwards', () => {
  const result = selectReviewFaces(cycle, 4);
  assert.deepEqual(result.ranges.map(range => [range.start.surah, range.start.ayah, range.end.surah, range.end.ayah]), [[80, 1, 78, 2], [114, 1, 114, 2]]);
  assert.deepEqual(result.next, { surah: 80, ayah: 1, page: 3, surahName: undefined });
  assert.equal(selectReviewFaces(cycle, 8).ranges.length, 3);
});
test('a repeated endpoint retains quantity and occurrence order', () => {
  const once = selectReviewFaces(cycle, 1), twice = selectReviewFaces(cycle, 5);
  assert.deepEqual(once.ranges.at(-1).end, twice.ranges.at(-1).end);
  assert.equal(twice.faces - once.faces, 4);
  assert.equal(twice.ranges.length, 2);
});
test('unmemorized verses and linking are skipped at every wrap', () => {
  const available = buildReviewCycle({ ayahs, start: ayahs[0], isAvailable: ayah => ayah.surah !== 79 });
  const result = selectReviewFaces(available, 6);
  assert.ok(result.ranges.every(range => range.start.surah !== 79 && range.end.surah !== 79));
  assert.equal(result.ranges.length, 4);
});
test('permissions and invalid quantities are enforced by the server selection', () => {
  const data = { ...cycle, expectedFaces: 2 };
  assert.throws(() => selectAuthorizedReview(data, 3, false), RangeError);
  assert.equal(selectAuthorizedReview(data, 2, false).faces, 2);
  for (const value of [0, -1, NaN, Infinity, 1209]) assert.throws(() => selectAuthorizedReview(data, value, true), RangeError);
});
test('next day resumes from the saved path; rejection resumes from its beginning', () => {
  const reviewExecution = selectReviewFaces(cycle, 3);
  const row = { taskDate: '2026-09-24', studentStatus: 'done', reviewExecution, fromPage: 1, toPage: 3 };
  assert.equal(reviewStartFromHistory([row], 1), 4);
  assert.equal(reviewStartFromHistory([{ ...row, teacherCompleted: 0 }], 1), 3);
});
test('undo clears the path together with the task execution in one transaction', async () => {
  const writes = [];
  const connection = { query: async (sql, args) => { writes.push({ sql, args }); } };
  await saveReviewCycle({ connection, tasks: [{ id: 1 }], studentId: 7, status: 'not_done', selection: null, expectedFaces: 2 });
  assert.equal(writes[0].args[5], null);
  assert.equal(writes[0].args[0], 'not_done');
});
test('hidden review never exposes the cyclic memorized route', () => {
  const result = studentVisibleToday({ reviewCycle: cycle }, { hideStudentAmounts: true }, 'student');
  assert.equal(result.reviewCycle, null);
});
