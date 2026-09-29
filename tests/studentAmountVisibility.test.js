import test from 'node:test';
import assert from 'node:assert/strict';
import { studentVisibleToday, studentVisibleTasks } from '../shared/student-amount-visibility.js';
import { buildPlanMushafTarget, buildStudentPlanWeeks, planTaskAmount } from '../src/lib/studentPlan.js';
import { studentHomePlan } from '../src/lib/studentHome.js';

const settings = { hideStudentAmounts: true };
const tasks = ['memorization', 'review', 'link'].map((taskType, id) => ({
  id, taskType, taskDate: '2026-09-11', fromPage: 2, toPage: 3,
  fromSurah: 2, toSurah: 2, fromAyah: 1, toAyah: 16,
  preview: 'مقدار سري', actualPreview: 'مقدار سري', targetPages: 2,
  normalEnd: { page: 3, surah: 2, ayah: 16 },
  teacherCompleted: true, studentStatus: 'done', points: 10, repeatCount: 3,
  ayahMarks: [{ surah: 2, ayah: 5 }], futureRangeField: 'مقدار سري',
}));
const data = { date: '2026-09-11', plan: { id: 5, track: 'memorization', dailyPages: 2, progress: { progressPercent: 25, normalEnd: tasks[0].normalEnd } },
  tasks, todayAmounts: tasks, nextDay: { date: '2026-09-12', tasks },
  executionAyahs: [{ page: 3, surah: 2, ayah: 16 }], executionLimits: { memorization: tasks[0].normalEnd } };

test('each amount switch independently protects execution, history and repeat ranges', () => {
  const keys = ['hideStudentMemorizationAmount', 'hideStudentReviewAmount', 'hideStudentLinkAmount'];
  for (let mask = 0; mask < 8; mask++) {
    const config = { hideStudentAmounts: true, ...Object.fromEntries(keys.map((key, i) => [key, Boolean(mask & (1 << i))])) };
    const executionAyahsByType = Object.fromEntries(tasks.map(task => [task.taskType, [{ surah: 2, ayah: task.id + 1 }]]));
    const result = studentVisibleToday({ ...data, executionAyahsByType }, config, 'student');
    assert.deepEqual(Object.keys(result.executionAyahsByType).sort(), tasks.filter((_, i) => !config[keys[i]]).map(task => task.taskType).sort());
    for (const [i, task] of result.tasks.entries()) {
      assert.equal(Boolean(task.amountHidden), config[keys[i]]);
      assert.equal(Boolean(task.preview), !config[keys[i]]);
      assert.equal(result.executionAyahs.some(ayah => ayah.ayah === i + 1), !config[keys[i]]);
    }
    const repeat = studentVisibleTasks([{ ...tasks[0], taskType: 'repeat' }], config, 'student')[0];
    assert.equal(Boolean(repeat.amountHidden), config.hideStudentMemorizationAmount);
    const history = buildStudentPlanWeeks({ rows: tasks, todayData: result, today: result.date }).flatMap(week => week.days).flatMap(day => day.tasks);
    for (const task of history) assert.equal(Boolean(task.amountHidden), config[keys[task.id]]);
  }
});

test('amounts stay unchanged by default and for staff even when enabled', () => {
  for (const role of ['teacher', 'supervisor', 'admin', undefined]) {
    assert.equal(studentVisibleToday(data, settings, role), data);
    assert.equal(studentVisibleTasks(tasks, settings, role), tasks);
  }
  for (const hideStudentAmounts of [undefined, false, 'false']) {
    assert.equal(studentVisibleToday(data, { hideStudentAmounts }, 'student'), data);
  }
});

test('all student task ranges and previews are removed without mutating teacher data', () => {
  const result = studentVisibleToday(data, settings, 'student');
  assert.equal(result.hideStudentAmounts, true);
  assert.deepEqual(result.plan, { id: 5, track: 'memorization', progressPercent: 25 });
  assert.deepEqual(result.executionAyahs, []);
  assert.deepEqual(result.executionLimits, {});
  for (const list of [result.tasks, result.todayAmounts, result.nextDay.tasks, studentVisibleTasks(tasks, settings, 'student')]) {
    assert.equal(list.length, 3);
    for (const task of list) {
      assert.equal(task.amountHidden, true);
      assert.equal(task.teacherCompleted, true);
      assert.equal(task.points, 10);
      assert.equal(task.repeatCount, 3);
      assert.equal(planTaskAmount(task), '');
      for (const key of ['fromPage', 'toAyah', 'preview', 'actualPreview', 'normalEnd', 'targetPages', 'ayahMarks', 'futureRangeField']) assert.equal(key in task, false, key);
    }
    assert.equal(buildPlanMushafTarget(list, 'الحفظ'), null);
  }
  assert.equal(data.tasks[0].preview, 'مقدار سري');
  assert.equal(result.studentTaskAmountEditable, false);
});

test('student home and cached session rows cannot reintroduce hidden amounts', () => {
  const result = studentVisibleToday(data, settings, 'student');
  const home = studentHomePlan(result, result.date);
  assert.equal(home.percent, 100);
  assert.ok(home.groups.every(group => group.amount === '' && group.target === null));
  const weeks = buildStudentPlanWeeks({ rows: tasks, todayData: result, today: result.date });
  assert.ok(weeks.flatMap(week => week.days).flatMap(day => day.tasks).every(task => task.amountHidden && !task.fromPage));
  assert.equal(studentVisibleToday({ plan: null }, settings, 'student').plan, null);
});
