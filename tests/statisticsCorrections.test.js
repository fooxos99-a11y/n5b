import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { loadExpectedGrades } from '../server/services/expectedGrades.js';
import { buildGradingSessionReport } from '../server/services/gradingReports.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
import { selectPlanForDate, loadQuranPlanPerformance } from '../server/services/quranPlanPerformance.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

const policy = normalizeGradingPolicy({ trackSession: { sessionDay: 4 }, weeklySession: { sessionDay: 4 } });
const expectedDb = ({ holidays = [], joined = '2026-01-01', records = [], pauses = [] } = {}) => ({
  student: () => '1=1', query: async sql => {
    if (sql.includes('AS holidays')) return [[{ holidays }]];
    if (sql.includes('state_json AS pause')) return [pauses];
    if (sql.includes('AS pause') || sql.includes('FROM grading_week_policies')) return [[]];
    if (sql.includes('AS joined')) return [[{ id: 1, joined }]];
    if (sql.includes('FROM student_weekly_components')) return [records];
    throw new Error(`Unexpected query: ${sql}`);
  },
});

test('partial periods exclude future sessions, holidays, individual pauses and pre-enrolment dates', async () => {
  for (const [from, to, options, count] of [
    ['2026-10-18', '2026-10-19', {}, 0],
    ['2026-10-20', '2026-10-21', {}, 0],
    ['2026-10-22', '2026-10-23', {}, 1],
    ['2026-10-22', '2026-10-23', { holidays: [{ startDate: '2026-10-22', endDate: '2026-10-22' }] }, 0],
    ['2026-10-22', '2026-10-23', { joined: '2026-10-23' }, 0],
    ['2026-10-22', '2026-10-23', { pauses: [{ studentId: 1, pause: { revision: 1, periods: [{ startDate: '2026-10-22', endDate: '2026-10-22' }] } }] }, 0],
    ['2026-10-19', '2026-10-29', {}, 2],
  ]) {
    const [row] = await loadExpectedGrades(expectedDb(options), { from, to, today: to, policy });
    assert.equal(row.trackWeeks, count, `${from}..${to} ${JSON.stringify(options)}`);
    assert.equal(row.weeklyWeeks, count);
    assert.equal(row.trackMax, count * 30);
    assert.equal(row.expectedSegments, count * 2);
  }
});

test('each historical week keeps its own recorded session date in a multiweek report', async () => {
  const records = [{ studentId: 1, component: 'track', weekStart: '2026-10-18',
    policy: normalizeGradingPolicy({ trackSession: { sessionDay: 2, segmentMax: 15 } }) }];
  const [row] = await loadExpectedGrades(expectedDb({ records }), {
    from: '2026-10-20', to: '2026-10-21', today: '2026-10-21', policy,
  });
  assert.equal(row.trackWeeks, 1);
  assert.equal(row.trackMax, 40);
  assert.equal(row.weeklyWeeks, 0);
});

test('daily and custom session queries bind exact boundaries and the same frozen session date', async () => {
  for (const to of ['2026-10-20', '2026-10-21']) {
    const calls = [];
    await buildGradingSessionReport({ query: async (sql, params) => { calls.push({ sql, params }); return [[]]; } },
      { component: 'track', from: '2026-10-20', to, auth: { role: 'supervisor', id: 7 } });
    const joined = calls.find(call => call.sql.includes('LEFT JOIN student_weekly_components'));
    assert.deepEqual(joined.params.slice(0, 3), ['track', '2026-10-20', to]);
    assert.match(joined.sql, /DATE_ADD\(w.week_start/);
    assert.doesNotMatch(joined.sql, /w.week_start BETWEEN/);
    assert.ok(joined.params.includes(7));
  }
});

test('historical performance selects the plan effective on each date, including superseded versions', async () => {
  const first = { id: 7, studentId: 3, track: 'memorization', startDate: '2026-09-20',
    startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7, dailyPages: 0.25 };
  const second = { ...first, id: 8, effectiveFrom: '2026-09-22', dailyPages: 0.5 };
  assert.equal(selectPlanForDate([second, first], '2026-09-21').id, 7);
  assert.equal(selectPlanForDate([first, second], '2026-09-22').id, 8);
  assert.equal(selectPlanForDate([first], '2026-09-19'), undefined);
  const scope = createOverviewReportScope({ query: async sql => [sql.includes('FROM student_quran_plans p') ? [first, second] : []] });
  const report = await loadQuranPlanPerformance(scope, { from: '2026-09-20', to: '2026-09-22',
    workDays: [0, 1, 2], expand: async row => [row] });
  assert.equal(report.students.length, 1, 'one series per student across revisions');
  assert.deepEqual(report.students[0].series.map(point => point.planId), [7, 7, 8]);
  assert.equal(report.students[0].series[0].expected, 0.25);
});

const operations = await readFile(new URL('../src/services/offlineOperationsService.js', import.meta.url), 'utf8');
test('cached reports expose freshness and a forbidden response never falls back to saved data', async () => {
  const start = operations.indexOf('export async function loadOfflineSnapshot(');
  const end = operations.indexOf('\nexport async function commitOfflineOperation', start);
  let failure, online = true;
  const context = vm.createContext({
    offlineActorKey: () => 'manager:7', isOnline: () => online, getAuthSessionVersion: () => 1,
    offlineRecitationStore: { getSnapshot: async () => ({ generatedAt: '2026-10-20T12:00:00Z', rows: [1] }) },
    fetchSnapshot: async () => { if (failure) throw failure; return { rows: [2] }; },
  });
  vm.runInContext(operations.slice(start, end).replace('export ', ''), context);
  const states = [];
  const load = () => context.loadOfflineSnapshot(7, 'report', () => {}, { onStatus: status => states.push(status) });
  assert.equal((await load()).rows[0], 2);
  assert.equal(states.at(-1).cached, false);
  failure = new Error('Network failed');
  assert.equal((await load()).rows[0], 1);
  assert.equal(states.at(-1).generatedAt, '2026-10-20T12:00:00Z');
  assert.equal(states.at(-1).cached, true);
  failure = Object.assign(new Error('Forbidden'), { status: 403 });
  await assert.rejects(load(), /Forbidden/);
  online = false;
  assert.equal((await load()).rows[0], 1);
});

test('the website never mounts the native mandatory update dialog', async () => {
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /WebUpdateDialog/);
  assert.match(main, /Capacitor.isNativePlatform\(\) && <NativeAppBridge/);
});
