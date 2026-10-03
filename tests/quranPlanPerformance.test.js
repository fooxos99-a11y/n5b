import assert from 'node:assert/strict';
import test from 'node:test';
import { planPerformanceSeries, aggregatePlanPerformance, loadQuranPlanPerformance } from '../server/services/quranPlanPerformance.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

const plan = { id: 7, studentId: 3, track: 'memorization', startDate: '2026-09-20', startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7, dailyPages: 0.25 };
test('a missed amount lowers performance, approved compensation restores it, duplicate ranges count once', () => {
  const dates = ['2026-09-20', '2026-09-21', '2026-09-22'];
  const executions = [{ ...plan, date: dates[2], planId: 7 }, { ...plan, date: dates[2], planId: 7 }];
  const series = planPerformanceSeries({ plan, dates, schedule: dates, executions });
  assert.equal(series[0].expected, 0.25); assert.equal(series[0].shortageFaces, 0.25);
  assert.equal(series[1].percentage, 0); assert.equal(series[2].percentage, 100);
  assert.equal(series[2].done, 0.5); assert.equal(series[2].expected, 0.5);
});
test('mastery starts from its own accepted work and future plans have no due amount', () => {
  const options = { dates: ['2026-09-20'], schedule: ['2026-09-20'], prior: [plan], executions: [{ ...plan, date: '2026-09-20', planId: 6 }] };
  assert.equal(planPerformanceSeries({ ...options, plan: { ...plan, track: 'mastery' } })[0].done, 0);
  const future = planPerformanceSeries({ ...options, plan: { ...plan, startDate: '2026-09-21' } })[0];
  assert.equal(future.percentage, null); assert.equal(future.expected, 0);
});
test('rate changes use their stored anchor and do not invent results before the effective date', () => {
  const series = planPerformanceSeries({ plan: { ...plan, effectiveFrom: '2026-09-21', anchorSurah: 1, anchorAyah: 3 },
    dates: ['2026-09-20', '2026-09-21'], schedule: ['2026-09-21'], executions: [] });
  assert.equal(series[0].percentage, null); assert.equal(series[1].expected, 0.5);
});
test('program performance weights due faces rather than averaging student percentages', () => {
  const [point] = aggregatePlanPerformance([
    { series: [{ done: 1, expected: 2 }] }, { series: [{ done: 9, expected: 9 }] }, { series: [{ done: 200, expected: 0 }] },
  ], ['2026-09-20']);
  assert.equal(point.percentage, 90.9); assert.equal(point.shortageFaces, 1);
});
test('performance queries retain teacher and circle scope and select approved execution only', async () => {
  const calls = [];
  const answers = [[plan], [], [], [], [], []];
  const connection = { query: async (sql, values) => { calls.push({ sql, values }); return [sql.includes('AS holidays') || sql.includes('AS pause') ? [] : answers.shift()]; } };
  const scope = createOverviewReportScope(connection, { auth: { role: 'supervisor', id: 15 }, committeeId: 2 });
  const result = await loadQuranPlanPerformance(scope, { from: '2026-09-20', to: '2026-09-21', workDays: [0,1,2,3,4], expand: async range => [range] });
  assert.equal(result.students.length, 1);
  assert.match(calls[0].sql, /MAX\(latest.id\)/);
  for (const call of calls.slice(0, 3)) {
    assert.match(call.sql, /supervisor_committees/); assert.ok(call.values.includes(15)); assert.ok(call.values.includes(2));
  }
  assert.match(calls[1].sql, /teacher_completed = 1/);
  assert.match(calls[1].sql, /teacher_completed IS NULL/);
  assert.match(calls[4].sql, /'review', 'link', 'repeat'/);
  assert.match(calls[4].sql, /g.component = 'reading'/);
  assert.match(calls[4].sql, /supervisor_committees/);
  assert.ok(calls[4].values.includes(15));
  const empty = await loadQuranPlanPerformance(createOverviewReportScope({ query: async () => [[]] }, { auth: { role: 'supervisor', id: 99 } }),
    { from: '2026-09-20', to: '2026-09-21', workDays: [], expand: async range => [range] });
  assert.equal(empty.students.length, 0);
  assert.throws(() => createOverviewReportScope(connection, { auth: { role: 'supervisor', id: 0 } }), { status: 422 });
});

test('weekly requirements update performance on their own day without counting future or other plans', () => {
  const date = '2026-09-20';
  const requirements = [
    { planId: 7, date, taskType: 'review', expected: 2, done: 1 },
    { planId: 7, date, taskType: 'link', expected: 1, done: 1 },
    { planId: 7, date, taskType: 'repeat', expected: 0.5, done: 0.5 },
    { date, taskType: 'reading', expected: 3, done: 4 },
    { planId: 8, date, taskType: 'review', expected: 100, done: 100 },
    { planId: 7, date: '2026-09-21', taskType: 'review', expected: 100, done: 100 },
  ];
  const [point] = planPerformanceSeries({ plan, dates: [date], schedule: [date], executions: [], requirements });
  assert.equal(point.done, 6.5); assert.equal(point.expected, 6.75);
  assert.equal(point.shortageFaces, 0.25); assert.equal(point.components.reading.done, 4);
  requirements[0].done = 2;
  const [updated] = planPerformanceSeries({ plan, dates: [date], schedule: [date], executions: [], requirements });
  assert.equal(updated.aheadFaces, 0.75); assert.equal(updated.shortageFaces, 0);
  const [aggregate] = aggregatePlanPerformance([{ series: [updated] }], [date]);
  assert.equal(aggregate.components.review.done, 2); assert.equal(aggregate.aheadFaces, 0.75);
});

test('unrecorded self reading remains due on reading days independently of work days', async () => {
  const connection = { query: async sql => [sql.includes('FROM student_quran_plans p') ? [{ ...plan, readingFaces: 2 }] : []] };
  const result = await loadQuranPlanPerformance(createOverviewReportScope(connection), {
    from: '2026-09-20', to: '2026-09-21', workDays: [0], readingDays: [0, 1], expand: async row => [row],
  });
  assert.equal(result.series[0].components.reading.expected, 2);
  assert.equal(result.series[1].components.reading.expected, 4);
  assert.equal(result.series[1].components.memorization.expected, 0.25);
  assert.equal(result.series[1].done, 0);
});
