import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { STUDENT_LEVELS, STUDENT_LEVEL_GROUPS, studentLevelShare } from '../shared/student-levels.js';
import { formatStatisticsNumber as formatNumber } from '../src/lib/statisticsNumber.js';

const source = await readFile(new URL('../src/components/dashboard/reports/reportMetrics.js', import.meta.url), 'utf8');
const context = vm.createContext({
  STUDENT_LEVELS, STUDENT_LEVEL_GROUPS, studentLevelShare, formatNumber,
  ...Object.fromEntries(['BookMarked', 'Building2', 'CalendarCheck2', 'CalendarRange', 'GraduationCap', 'PlusCircle', 'Route'].map(key => [key, key])),
});
vm.runInContext(source.replace(/import[\s\S]*?;/g, '').replace(/export /g, ''), context);
const build = (overview, options) => context.buildReportMetrics(overview, options);
const sessionRows = [
  { id: 1, name: 'الأول', committeeName: 'الفجر', expectedWeeks: 2, attended: 1, absent: 0, grade: 18, max: 60, expectedSegments: 4, segments: { tested: 1, grade: 8, max: 10 } },
  { id: 2, name: 'الثاني', committeeName: 'العصر', expectedWeeks: 2, attended: 0, absent: 1, grade: 4, max: 60, expectedSegments: 4, segments: { tested: 1, grade: 4, max: 10 } },
];
const overview = { grades: {
  weeklySession: { expectedAttendance: 4, attended: 1, percentage: 100, studentsList: sessionRows },
  trackSession: { expectedAttendance: 4, attended: 1, percentage: 100, segments: { tested: 2, grade: 12, max: 20, expected: 8 }, studentsList: sessionRows },
} };

test('late remains attended while excused absence has its own label in both session details', () => {
  const studentsList = [
    { ...sessionRows[0], attended: 1, late: 1, excused: 0 },
    { ...sessionRows[1], attended: 0, absent: 0, late: 0, excused: 1, segments: { tested: 0, grade: 0, max: 0 } },
  ];
  const metrics = build({ grades: { weeklySession: { attended: 1, expectedAttendance: 4, studentsList },
    trackSession: { attended: 1, expectedAttendance: 4, studentsList, segments: { grade: 8, max: 10 } } } });
  for (const key of ['weeklySession', 'trackSession']) {
    const metric = metrics.find(item => item.id === key);
    assert.ok(metric.records[0].rows[0].stats.some(stat => stat.label === 'متأخر' && stat.value === '1'));
    assert.ok(metric.records[0].rows[1].stats.some(stat => stat.label === 'مستأذن' && stat.value === '1'));
    const filtered = build({ grades: { [key]: { studentsList } } }, { committee: 'الفجر' }).find(item => item.id === key);
    assert.equal(filtered.records[0].rows.length, 1);
  }
  assert.equal(metrics.find(item => item.id === 'trackSession').records[0].rows[1].value, 'مستأذن');
});

test('self reading shows recorded Quran ahzab as a count and follows the circle filter', () => {
  const data = { grades: { reading: { hizbs: 5, byStudent: { 1: { hizbs: 2, faces: 20 }, 2: { hizbs: 3, faces: 31 } } } },
    committeeIndicators: [{ name: 'الفجر', students: [{ id: 1, name: 'الأول' }] }, { name: 'العصر', students: [{ id: 2, name: 'الثاني' }] }] };
  const all = build(data)[0];
  assert.equal(all.tiles.at(-1).display, '5');
  const selected = build(data, { committee: 'الفجر' })[0];
  assert.equal(selected.tiles.at(-1).display, '2');
  assert.equal(selected.records[0].rows[0].stats.at(-1).value, '2');
  // Old face-only records have no identifiable Quran range and cannot be guessed as ahzab.
  assert.equal(build({ grades: { reading: { days: 3, byStudent: { 1: { faces: 30 } } } } })[0].tiles.at(-1).display, '0');
});

test('weekly attendance includes unrecorded weeks and changes with the selected circle', () => {
  const all = build(overview).find(metric => metric.id === 'weeklySession');
  assert.equal(all.display, '25%');
  assert.equal(all.tiles[0].display, '1');
  assert.equal(all.tiles[1].display, '25%');
  const selected = build(overview, { committee: 'الفجر' }).find(metric => metric.id === 'weeklySession');
  assert.equal(selected.display, '50%');
  assert.equal(selected.records[0].rows.length, 1);
  assert.equal(selected.records[0].rows[0].stats[0].value, '1 من 2');
  assert.equal(selected.records[0].rows[0].stats[1].value, '50%');
  assert.equal(build(overview, { committee: 'غير موجود' }).find(metric => metric.id === 'weeklySession').display, '—');
});

test('track accuracy uses tested grades and circle-specific attendance with error, warning and hesitation counters', () => {
  const all = build(overview).find(metric => metric.id === 'trackSession');
  assert.equal(all.display, '18%');
  assert.equal(all.tiles[1].display, '60%');
  assert.equal(all.tiles[2].display, '25%');
  assert.equal(all.tiles.length, 7);
  assert.equal(all.tiles[0].display, '25%');
  assert.equal(all.tiles[1].label, 'إتقان المقاطع المختبرة');
  const selected = build(overview, { committee: 'الفجر' }).find(metric => metric.id === 'trackSession');
  assert.equal(selected.display, '30%');
  assert.equal(selected.tiles[1].display, '80%');
  assert.equal(selected.tiles[0].display, '50%');
  assert.equal(selected.records[0].rows[0].stats.length, 5);
});

test('each plan metric has its own achievement tone, with missing targets neutral', () => {
  const student = { id: 1, name: 'طالب', metrics: {
    attendance: { done: 8, total: 10 }, memorization: { done: 5, total: 10 },
    mastery: { done: 4, total: 10 }, review: { done: 0, total: 0 }, link: { done: 10, total: 10 },
  } };
  const metric = build({ committeeIndicators: [{ name: 'الفجر', students: [student] }] })[0];
  const stats = metric.records[0].rows[0].stats;
  assert.match(stats[0].tone, /emerald/); assert.match(stats[1].tone, /amber/);
  assert.match(stats[2].tone, /destructive/); assert.match(stats[3].tone, /bg-muted/);
  assert.match(stats[4].tone, /emerald/);
  assert.equal(stats[2].value, '4 من 10');
});

test('passing cards show result averages independently, preserving page totals and scoped details', () => {
  const data = { branchPassing: { metric: 'result_average', expected: 3, tested: 2, percentage: 85, passedParts: 2, studentsList: [
    { name: 'الأول', committeeName: 'الفجر', percentage: 80, testedParts: 2, passedParts: 1 },
    { name: 'الثاني', committeeName: 'الفجر', percentage: null, testedParts: 0, passedParts: 0 },
    { name: 'الثالث', committeeName: 'العصر', percentage: 90, testedParts: 1, passedParts: 1 },
  ] }, hafizPassing: { metric: 'result_average', expected: 3, tested: 1, percentage: 40, passedParts: 0, studentsList: [] }, studentLevels: [] };
  const metrics = build(data), all = metrics.find(metric => metric.id === 'branchPassing');
  assert.equal(all.display, '85٪'); assert.equal(all.tiles[0].display, '3');
  const selected = build(data, { committee: 'الفجر' }).find(metric => metric.id === 'branchPassing');
  assert.equal(selected.display, '85٪'); assert.equal(selected.tiles[0].display, '2');
  assert.equal(selected.tiles[1].display, '1'); assert.equal(selected.tiles[2].display, '1');
  assert.equal(selected.records[0].rows.length, 2);
  assert.equal(selected.records[0].rows[0].value, '80٪');
  assert.equal(selected.records[0].rows[1].value, 'لم يُختبر');
  assert.equal(metrics.find(metric => metric.id === 'hafizPassing').display, '40٪');
  assert.equal(metrics.find(metric => metric.id === 'levels').label, 'الطلاب');
  assert.equal(build({}).find(metric => metric.id === 'branchPassing').display, 'غير متاح');
  assert.equal(build({ branchPassing: { expected: 10, tested: 5, percentage: 50 } }).find(metric => metric.id === 'branchPassing').display, 'غير متاح', 'legacy coverage must never be shown as result average');
  assert.equal(build({ branchPassing: { metric: 'result_average', percentage: null } }).find(metric => metric.id === 'branchPassing').display, '—');
});


test('no due session differs from a due unrecorded session and a genuine zero grade', () => {
  const empty = build({ grades: { trackSession: { max: 0 }, weeklySession: { expectedAttendance: 0 } } });
  assert.equal(empty.find(row => row.id === 'trackSession').display, '—');
  assert.equal(empty.find(row => row.id === 'weeklySession').display, '—');
  const due = build({ grades: { trackSession: { grade: 0, max: 30, segments: { expected: 2 } } } }).find(row => row.id === 'trackSession');
  assert.equal(due.display, '0%');
  assert.equal(due.tiles[1].display, 'لم يُختبر');
  assert.equal(due.tiles[2].display, '0%');
  const zero = build({ grades: { trackSession: { grade: 0, max: 30, segments: { tested: 2, expected: 2, grade: 0, max: 20 } } } }).find(row => row.id === 'trackSession');
  assert.equal(zero.tiles[1].display, '0%');
  assert.equal(zero.tiles[2].display, '100%');
});
