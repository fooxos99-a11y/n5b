import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentPlanPoints } from '../server/services/studentPlanPoints.js';
import { buildStudentPlanWeeks } from '../src/lib/studentPlan.js';
const today = '2026-09-07';
const task = { id: 1, planId: 1, taskDate: today, taskType: 'memorization', track: 'memorization' };
const build = (extra = {}) => buildStudentPlanPoints({ total: 1234, rows: [task], attendance: [], transactions: [], today, ...extra });
test('daily earned points are the grade points of the day, without a store balance or a maximum', () => {
  const result = build({ transactions: [{ date: today, points: 7.5, source: 'grade', type: 'increase', reason: 'درجة الحفظ' },
    { date: today, points: 1.25, source: 'grade', type: 'increase', reason: 'درجة الحضور' }] });
  assert.equal(result.total, 1234);
  assert.equal(result.days[0].earned, 8.75);
  assert.equal('maximum' in result.days[0], false);
  assert.deepEqual(result.days[0].details.map(item => item.label), ['درجة الحفظ', 'درجة الحضور']);
  assert.equal(result.days[0].pending, false);
});
test('pending evaluations are not reported as a zero grade', () => {
  assert.equal(build({ rows: [task, { ...task, id: 2 }] }).days[0].pending, true);
});
test('deductions remain visible and attendance-only previous days are included', () => {
  const result = build({ transactions: [{ date: '2026-09-06', points: 0.95, source: 'grade', type: 'increase' },
    { date: '2026-09-06', points: 5, source: 'manual', type: 'deduction' }] });
  const prior = result.days.find(day => day.date === '2026-09-06');
  assert.equal(prior.earned, 0.95); assert.equal(prior.additionalEarned, -5); assert.equal(prior.additionalDetails[0].earned, -5);
  const weeks = buildStudentPlanWeeks({ today, points: result });
  assert.equal(weeks.flatMap(week => week.days).find(day => day.date === prior.date).points.earned, 0.95);
});
test('future entries never receive displayed points', () => {
  const result = build({ rows: [{ ...task, taskDate: '2026-09-08' }], transactions: [{ date: '2026-09-08', points: 25 }] });
  assert.equal(result.days.length, 0);
});
test('manual awards stay additional and never count as earned grade points', () => {
  const result = build({ transactions: [{ date: today, points: 122, source: 'manual', type: 'increase' }] });
  assert.equal(result.days[0].earned, 0);
  assert.equal(result.days[0].additionalEarned, 122);
});
