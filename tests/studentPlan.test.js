import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildStudentPlanWeeks, buildPlanMushafTarget, planProgressPercent, planTaskCompleted, planCompactAmount } from '../src/lib/studentPlan.js';

const task = (id, taskDate, overrides = {}) => ({ id, taskDate, taskType: 'memorization', fromPage: 3, toPage: 4, fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 24, ...overrides });

test('tomorrow belongs to its calendar week and stale previews never appear', () => {
  const build = (date, nextDate) => buildStudentPlanWeeks({ today: date, todayData: { date, nextDay: { date: nextDate, tasks: [task('preview', nextDate, { repeatCount: 7 })] } } });
  const sameWeek = build('2026-09-06', '2026-09-07');
  assert.equal(sameWeek.length, 1);
  assert.deepEqual(sameWeek[0].days.map(day => day.date), ['2026-09-07', '2026-09-06']);
  assert.equal(sameWeek[0].days[0].preview, true);
  assert.equal(sameWeek[0].days[0].tasks[0].repeatCount, 7);
  const nextWeek = build('2026-09-12', '2026-09-13');
  assert.deepEqual(nextWeek.map(week => week.start), ['2026-09-13', '2026-09-06']);
  assert.equal(build('2026-09-06', '2026-09-08')[0].days.length, 1);
  const stale = buildStudentPlanWeeks({ today: '2026-09-07', todayData: { date: '2026-09-06', nextDay: { date: '2026-09-08', tasks: [task(1, '2026-09-08')] } } });
  assert.equal(stale[0].days[0].preview, undefined);
});

test('weekly plan starts with today, keeps assignment dates and shifts weeks at Sunday midnight', () => {
  const rows = [task(1, '2026-09-05'), task(2, '2026-09-06'), task(3, '2026-09-07'), task(4, '2026-09-04', { sessionDate: '2026-09-07' }), task(5, 'invalid')];
  const sunday = buildStudentPlanWeeks({ rows, today: '2026-09-06' });
  assert.deepEqual(sunday.map((week) => week.start), ['2026-09-06', '2026-08-30']);
  assert.deepEqual(sunday[0].days.map((day) => day.date), ['2026-09-06']);
  assert.deepEqual(sunday[1].days.map((day) => day.date), ['2026-09-05', '2026-09-04']);
  const monday = buildStudentPlanWeeks({ rows, today: '2026-09-07' });
  assert.deepEqual(monday[0].days.map((day) => day.date), ['2026-09-07', '2026-09-06']);
  assert.equal(buildStudentPlanWeeks({ today: '2026-09-13' })[0].start, '2026-09-13');
});

test('cached yesterday amounts are never relabeled as today, and current rows keep their counts', () => {
  const todayData = { date: '2026-09-06', repeatCount: 10, listeningCount: 3, todayAmounts: [task(1, '2026-09-06')] };
  const nextDay = buildStudentPlanWeeks({ today: '2026-09-07', todayData });
  assert.equal(nextDay[0].days[0].tasks.length, 0);
  assert.equal(nextDay[0].days[1].tasks.length, 1);
  const merged = buildStudentPlanWeeks({ today: '2026-09-06', todayData, rows: [task(1, '2026-09-06', { repeatCount: 5, teacherCompleted: true })] });
  assert.equal(merged[0].days[0].tasks.length, 1);
  assert.equal(merged[0].days[0].tasks[0].repeatCount, 5);
  assert.equal(merged[0].days[0].tasks[0].teacherCompleted, true);
});

test('approved plan progress is clamped and submission alone is not marked completed', () => {
  assert.equal(planProgressPercent({ progressPercent: 44 }), 44);
  assert.equal(planProgressPercent({ progressPercent: 1000 }), 100);
  assert.equal(planProgressPercent({ progressPercent: 'invalid' }), 0);
  assert.equal(planProgressPercent(null), 0);
  assert.equal(planTaskCompleted({ studentStatus: 'done', teacherCompleted: null }), false);
  assert.equal(planTaskCompleted({ teacherCompleted: false }), false);
  assert.equal(planTaskCompleted({ teacherCompleted: true }), true);
});

test('every task type opens its own range, including disjoint and reverse memorization', () => {
  for (const type of ['memorization', 'review', 'link']) {
    const target = buildPlanMushafTarget([task(1, '2026-09-06', { taskType: type, fromPage: 40 }), task(2, '2026-09-06', { taskType: type, fromPage: 55 })], type);
    assert.equal(target.page, 40);
    assert.deepEqual(target.ranges.map((range) => range.page), [40, 55]);
    assert.equal(target.label, type);
  }
  const reverse = buildPlanMushafTarget([task(1, '2026-09-06', { fromSurah: 114, toSurah: 113, fromPage: 604 })], 'الحفظ');
  assert.equal(reverse.range.direction, -1);
  assert.equal(reverse.page, 604);
  assert.equal(buildPlanMushafTarget([], 'الربط'), null);
});

test('weekly history retains student authorization and parameterized dates without changing the sessions default', async () => {
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/students/:id/quran-sessions'"), source.indexOf("app.get('/api/students/:id/quran-saved'"));
  assert.match(route, /canReadStudentQuranToday\(req, studentId\)/);
  assert.match(route, /planView \? `AND \$\{studyDateSql\('t.task_date', 't.student_id'\)\} AND \$\{uncompensatedTaskSql\('t'\)\} AND t.task_date <= \?` : 'AND t.teacher_completed IS NOT NULL'/);
  assert.match(route, /planView \? \[studentId, today\] : \[studentId\]/);
  assert.match(route, /planView \? '' : 'LIMIT 200'/);
});

test('plan history includes the teacher marks instead of dropping them', async () => {
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/students/:id/quran-sessions'"), source.indexOf("app.get('/api/students/:id/quran-saved'"));
  assert.match(route, /const marksByTask = await getQuranTaskDisplayMarks/);
  const teacherTask = task(1, '2026-09-06', { mistakeCount: 1, warningCount: 2, ayahMarks: [{ markType: 'warning', notes: 'راجع المد' }] });
  const weeks = buildStudentPlanWeeks({ rows: [teacherTask], todayData: { date: '2026-09-06', tasks: [task(1, '2026-09-06')] }, today: '2026-09-06' });
  assert.equal(weeks[0].days[0].tasks[0].mistakeCount, 1);
  assert.deepEqual(weeks[0].days[0].tasks[0].ayahMarks, teacherTask.ayahMarks);
});


test('compact plan amounts preserve both Quran endpoints on one line', () => {
  assert.equal(planCompactAmount({ayahPreview:'البقرة، من آية ٦ إلى ١٦'}),'البقرة ٦–١٦');
  assert.equal(planCompactAmount({ayahPreview:'البقرة آية ٢٨٣ إلى آل عمران آية ٩'}),'البقرة ٢٨٣–آل عمران ٩');
});
