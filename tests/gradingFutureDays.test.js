import assert from 'node:assert/strict';
import test from 'node:test';
import { computeWeeklyGrade } from '../shared/grading-engine.js';
import { computeStudentsWeeklyGrades, computeTermGrades, loadGradingPolicyForDate } from '../server/services/grading.js';

const days = Array.from({ length: 7 }, (_, weekday) => ({
  date: `2026-09-${20 + weekday}`, weekday, planActive: true,
}));

test('row evaluation and reading use the frozen weekly policy without freezing on reads', async () => {
  const writes = [];
  const query = async (sql, values) => {
    if (sql.includes('app_settings')) return [[{ value: JSON.stringify({ weeklyProgram: { mistakeDeduction: 0.9 } }) }]];
    if (sql.startsWith('INSERT')) { writes.push(values); return [{}]; }
    return [[{ weekStart: '2026-09-20', policy: JSON.stringify({ weeklyProgram: { mistakeDeduction: 0.2 } }) }]];
  };
  assert.equal((await loadGradingPolicyForDate({ query }, '2026-09-21', { freeze: false })).weeklyProgram.mistakeDeduction, 0.2);
  assert.equal(writes.length, 0);
  assert.equal((await loadGradingPolicyForDate({ query }, '2026-09-21')).weeklyProgram.mistakeDeduction, 0.2);
  assert.equal(writes[0][0], '2026-09-20');
});

test('future days award no not-applicable credit and remove their maxima', () => {
  const result = computeWeeklyGrade({}, { days, today: '2026-09-21' });
  assert.equal(result.parts.memorization, 2);
  assert.equal(result.parts.link, 2);
  assert.equal(result.parts.review, 2);
  assert.equal(result.weeklyProgram.max, 13);
  assert.equal(result.max, 83);
  assert.equal(result.days.filter(day => day.excluded).length, 5);
  assert.deepEqual(result.days[2].components, {});
});

test('even stored grades in future days do not enter the total', () => {
  const result = computeWeeklyGrade({}, {
    days: days.map(day => ({ ...day, attendance: { grade: 1 }, reading: { grade: 1 },
      memorization: { scheduled: true, grade: 1 }, link: { scheduled: true, grade: 1 }, review: { scheduled: true, grade: 1 } })),
    today: '2026-09-21',
  });
  assert.equal(result.weeklyProgram.grade, 13);
  assert.equal(result.weeklyProgram.max, 13);
});

test('entirely future weeks have neither grades nor a denominator; finished weeks retain their scale', () => {
  const future = computeWeeklyGrade({}, { days, today: '2026-09-19', track: { grade: 30 }, weekly: { grade: 20 } });
  assert.equal(future.total, 0);
  assert.equal(future.max, 0);
  const finished = computeWeeklyGrade({}, { days, today: '2026-09-26' });
  assert.equal(finished.max, 100);
  assert.equal(finished.parts.link, 5);
});

const connection = { query: async sql => {
  if (sql.includes('app_settings')) return [[{ value: '{}' }]];
  if (sql.includes('FROM student_quran_plans')) return [[{ studentId: 1, startDate: '2026-09-20', status: 'active' }]];
  return [[]];
} };

test('weekly and term services carry the requested business-date cutoff into grading', async () => {
  const result = (await computeStudentsWeeklyGrades(connection, { studentIds: [1], weekStart: '2026-09-20', today: '2026-09-21' })).get(1);
  assert.equal(result.max, 83);
  assert.equal(result.parts.link, 2);
  const term = (await computeTermGrades(connection, { studentIds: [1], from: '2026-09-20', today: '2026-09-21' })).get(1);
  assert.equal(term.weeks[0].max, 83);
});
