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
  { id: 1, name: 'الأول', committeeName: 'الفجر', expectedWeeks: 2, attended: 1, absent: 0, grade: 100, max: 100, segments: { tested: 1, grade: 8, max: 10 } },
  { id: 2, name: 'الثاني', committeeName: 'العصر', expectedWeeks: 2, attended: 0, absent: 1, grade: 100, max: 100, segments: { tested: 1, grade: 4, max: 10 } },
];
const overview = { grades: {
  weeklySession: { expectedAttendance: 4, attended: 1, percentage: 100, studentsList: sessionRows },
  trackSession: { expectedAttendance: 4, attended: 1, percentage: 100, segments: { tested: 2, grade: 12, max: 20 }, studentsList: sessionRows },
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
  assert.equal(build(overview, { committee: 'غير موجود' }).find(metric => metric.id === 'weeklySession').display, '0%');
});

test('track accuracy uses tested grades and circle-specific attendance with error, warning and hesitation counters', () => {
  const all = build(overview).find(metric => metric.id === 'trackSession');
  assert.equal(all.display, '60%');
  assert.equal(all.tiles.length, 6);
  assert.equal(all.tiles[0].display, '25%');
  assert.equal(all.tiles[1].label, 'نسبة إتقان الحفظ');
  const selected = build(overview, { committee: 'الفجر' }).find(metric => metric.id === 'trackSession');
  assert.equal(selected.display, '80%');
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
