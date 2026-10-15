import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStudentSessionWeeks } from '../../src/lib/studentSessionWeeks.js';
import { studentSessionDays } from '../src/components/portal/studentSessionPresentation';
import { decodeStudentOverview, decodeStudentToday, studentPlanWeeks } from '../src/domain/studentDashboard';

const today = '2026-10-15'; const studentId = 7;
const task = { id: 1, studentId, planId: 2, taskDate: '2026-10-12', taskType: 'memorization',
  teacherCompleted: true, fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 };
const record = { attendance: { grade: 1, max: 1, passed: true, detail: { status: 'present' } } };
function fixture() {
  const grade = { weekStart: '2026-10-11', weekEnd: '2026-10-17', total: 25, max: 98,
    weeklyProgram: { grade: 25, max: 83 }, trackSession: { grade: 0, max: 10 }, weeklySession: { grade: 0, max: 5 },
    days: [
      { date: '2026-10-13', excluded: true, components: { attendance: { grade: 1, max: 1 } } },
      { date: '2026-10-14', components: { attendance: { grade: 1, max: 1 } } },
      { date: today, components: { attendance: { grade: 0, max: 1 } } },
    ], records: { '2026-10-13': record, '2026-10-14': record } };
  const rawToday = { date: today, tasks: [], todayAmounts: [] };
  const rawOverview = { rows: [task], points: { total: 25, days: [] }, weeklyGrades: [grade] };
  const plan = { today: decodeStudentToday(rawToday, studentId), overview: decodeStudentOverview(rawOverview, studentId) };
  const weeks = studentPlanWeeks(plan);
  const reference = Reflect.apply(buildStudentSessionWeeks, undefined, [{ rows: rawOverview.rows, todayData: rawToday,
    weeklyGrades: rawOverview.weeklyGrades, points: rawOverview.points, today }]) as { days: { date: string }[] }[];
  return { plan, week: weeks[0]!, reference: reference[0]! };
}

test('session view excludes excluded record-only dates while retaining scheduled records, tasks and today like the source', () => {
  const { week, reference } = fixture();
  assert.equal(week.days.some(day => day.date === '2026-10-13'), true);
  const visible = studentSessionDays(week, today);
  assert.deepEqual(visible.map(day => day.date), ['2026-10-15', '2026-10-14', '2026-10-12']);
  assert.deepEqual(visible.map(day => day.date), reference.days.map(day => day.date));
});

test('a scheduled summary without a recorded component does not invent a historical day', () => {
  const { week } = fixture();
  week.days.push({ date: '2026-10-11', tasks: [] });
  week.grade!.scheduledRecords['2026-10-11'] = { attendance: true, reading: true };
  week.days.push({ date: '2026-10-16', tasks: [] });
  week.grade!.scheduledRecords['2026-10-16'] = { attendance: true, reading: false };
  week.grade!.records['2026-10-16'] = week.grade!.records['2026-10-14']!;
  assert.deepEqual(studentSessionDays(week, today).map(day => day.date), ['2026-10-15', '2026-10-14', '2026-10-12']);
});

test('points-only history remains visible and the presentation preserves task identities and all grade data', () => {
  const { plan, week } = fixture();
  week.days.push({ date: '2026-10-11', tasks: [], points: { date: '2026-10-11', earned: 2,
    additionalEarned: 0, pending: false, details: [], additionalDetails: [] } });
  const before = JSON.stringify({ plan, week }); const grade = week.grade;
  const taskDay = week.days.find(day => day.date === task.taskDate)!;
  const visible = studentSessionDays(week, today);
  assert.equal(visible.includes(week.days.at(-1)!), true);
  assert.equal(visible.find(day => day.date === task.taskDate), taskDay);
  assert.equal(taskDay.tasks[0]?.studentId, studentId); assert.equal(taskDay.tasks[0]?.id, task.id);
  assert.equal(week.grade, grade); assert.equal(week.grade?.total, 25); assert.equal(week.grade?.max, 98);
  assert.equal(JSON.stringify({ plan, week }), before);
});
