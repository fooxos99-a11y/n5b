import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedPlanCompletion } from '../src/lib/quranPlanPreview.js';
import { buildOverviewRankings } from '../server/services/overviewRankings.js';

test('plan completion advances over holidays without consuming execution days', () => {
  assert.deepEqual(expectedPlanCompletion({pages: 3, dailyPages: 1, startDate: '2026-10-01'}), {days: 3, endDate: '2026-10-05'});
  assert.deepEqual(expectedPlanCompletion({pages: 1, dailyPages: 1, startDate: '2026-10-02'}), {days: 1, endDate: '2026-10-04'});
  assert.deepEqual(expectedPlanCompletion({pages: 2.5, dailyPages: 0.5, startDate: '2026-10-01', weeklyHolidayDays: [5, 6]}), {days: 5, endDate: '2026-10-07'});
  assert.deepEqual(expectedPlanCompletion({pages: 3, dailyPages: 1, startDate: '2026-12-31', weeklyHolidayDays: [5, 6]}), {days: 3, endDate: '2027-01-04'});
  assert.deepEqual(expectedPlanCompletion({pages: 3, dailyPages: 1, startDate: '2026-10-01', weeklyHolidayDays: []}), {days: 3, endDate: '2026-10-03'});
  assert.deepEqual(expectedPlanCompletion({pages: 0, startDate: '2026-10-01'}), {days: 0, endDate: ''});
  assert.equal(expectedPlanCompletion({pages: 3, startDate: '2026-10-01', weeklyHolidayDays: [0, 1, 2, 3, 4, 5, 6]}).endDate, '');
});

test('circle achievement does not increase when its student count doubles', async () => {
  const circles = [{id: 1, name: 'عشرة', studentsCount: 10}, {id: 2, name: 'عشرون', studentsCount: 20}, {id: 3, name: 'خمسة', studentsCount: 5}];
  const answers = [[], circles, [], []];
  const reportDb = {student: () => '1', committee: () => '1', staff: () => '1', query: async () => [answers.shift()]};
  const studentsList = circles.flatMap(circle => Array.from({length: circle.studentsCount}, (_, index) => ({id: circle.id * 100 + index, name: String(index), committeeName: circle.name, grade: circle.id === 3 ? 90 : 80, max: 100})));
  const result = await buildOverviewRankings(reportDb, {from: '2026-09-27', to: '2026-10-01', grades: {weeklyProgram: {studentsList}}});
  assert.equal(result.bestCommittees[0].id, 3);
  assert.equal(result.bestCommittees.find(row => row.id === 1).percentage, 80);
  assert.equal(result.bestCommittees.find(row => row.id === 2).percentage, 80);
});
