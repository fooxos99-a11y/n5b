import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { STUDENT_LEVELS, daysBetweenDates, resolveStudentLevel } from '../shared/student-levels.js';
import { buildQuranCoverageIndex, loadStudentLevels, rangeIntervals, studentJuzStatus } from '../server/services/studentLevels.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const complete = (juzs, completedOn = null) => new Map(juzs.map((juz) => [juz, { total: 10, covered: 10, pages: 20, completedOn }]));

test('levels run from juz 30 down, two juz each except the four juz of the second graduates level', () => {
  assert.deepEqual(STUDENT_LEVELS.map((level) => [level.name, level.juzs.join('،')]), [
    ['تأهيل 1', '30،29'], ['تأهيل 2', '28،27'],
    ['نجباء 1', '26،25'], ['نجباء 2', '24،23'], ['نجباء 3', '22،21'],
    ['فرسان 1', '20،19'], ['فرسان 2', '18،17'], ['فرسان 3', '16،15'],
    ['حفاظ 1', '14،13'], ['حفاظ 2', '12،11'], ['حفاظ 3', '10،9'],
    ['خريجين 1', '8،7'], ['خريجين 2', '6،5،4،3'], ['خريجين 3', '2،1'],
  ]);
  assert.deepEqual([...new Set(STUDENT_LEVELS.flatMap((level) => level.juzs))].sort((a, b) => a - b), Array.from({ length: 30 }, (_, index) => index + 1));
});

test('a student sits in the first level not fully memorized, whatever order its juz were memorized in', () => {
  assert.equal(resolveStudentLevel(new Map()).name, 'تأهيل 1');
  assert.equal(resolveStudentLevel(new Map()).since, null);
  const status = complete([30, 29], '2026-09-01');
  status.set(28, { total: 10, covered: 5, pages: 20 });
  status.set(27, { total: 10, covered: 0, pages: 20 });
  const level = resolveStudentLevel(status);
  assert.equal(level.name, 'تأهيل 2');
  assert.equal(level.progressPercent, 25);
  assert.equal(level.since, '2026-09-01');
  // Juz 29 before juz 30 still completes the first level; a gap keeps the student in it.
  assert.equal(resolveStudentLevel(complete([29, 28, 27])).name, 'تأهيل 1');
});

test('the level starts when its previous levels were completed and the whole Quran stays at the last level', () => {
  const status = complete([30, 29], '2026-08-01');
  for (const [juz, date] of [[28, '2026-09-10'], [27, '2026-09-03']]) status.set(juz, { total: 10, covered: 10, pages: 20, completedOn: date });
  assert.deepEqual(resolveStudentLevel(status), {
    key: 'nujaba-1', name: 'نجباء 1', group: 'nujaba', rank: 1, index: 2, color: STUDENT_LEVELS[2].color,
    finished: false, progressPercent: 0, since: '2026-09-10',
  });
  const finished = resolveStudentLevel(complete(Array.from({ length: 30 }, (_, index) => index + 1), '2026-09-20'));
  assert.equal(finished.name, 'خريجين 3');
  assert.equal(finished.finished, true);
  assert.equal(finished.progressPercent, 100);
  assert.equal(daysBetweenDates('2026-09-20', '2026-09-27'), 7);
  assert.equal(daysBetweenDates('2026-09-27', '2026-09-20'), 0);
});

// Three surahs across two juz: surah 1 (juz 1, page 1), surahs 2 and 3 (juz 2, pages 2-3).
const rows = [
  { surah: 1, ayah: 1, page: 1, juz: 1 }, { surah: 1, ayah: 2, page: 1, juz: 1 },
  { surah: 2, ayah: 1, page: 2, juz: 2 }, { surah: 2, ayah: 2, page: 2, juz: 2 },
  { surah: 3, ayah: 1, page: 3, juz: 2 }, { surah: 3, ayah: 2, page: 3, juz: 2 },
];

test('copying saved memorization into a new plan does not reset the level entry date', () => {
  const index = buildQuranCoverageIndex(rows);
  const range = { startSurah: 2, startAyah: 1, endSurah: 3, endAyah: 2 };
  const original = { range, date: '2026-09-01' };
  const copied = { range, date: '2026-09-28' };
  const status = studentJuzStatus(index, [copied, original]);
  assert.equal(status.get(2).completedOn, '2026-09-01');
});

test('memorized ranges cover mushaf positions forwards and in the descending surah order', () => {
  const index = buildQuranCoverageIndex(rows);
  assert.deepEqual(index.juzs.get(2), { first: 2, last: 5, pages: 2 });
  assert.deepEqual(rangeIntervals(index, { startSurah: 1, startAyah: 2, endSurah: 2, endAyah: 1 }), [[1, 2]]);
  // From surah 3 back to surah 1: each surah read forwards.
  assert.deepEqual(rangeIntervals(index, { startSurah: 3, startAyah: 2, endSurah: 1, endAyah: 1 }), [[5, 5], [2, 3], [0, 0]]);
  assert.deepEqual(rangeIntervals(index, { startSurah: 9, startAyah: 1, endSurah: 1, endAyah: 1 }), []);
  const status = studentJuzStatus(index, [
    { range: { startSurah: 3, startAyah: 1, endSurah: 2, endAyah: 2 }, date: '2026-09-05' },
    { range: { startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 1 }, date: '2026-09-02' },
  ]);
  assert.deepEqual(status.get(2), { total: 4, covered: 4, pages: 2, completedOn: '2026-09-05' });
  assert.deepEqual(status.get(1), { total: 2, covered: 0, pages: 1, completedOn: null });
});

test('student levels load in three scoped queries and count the days in the current level', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('FROM students s')) return [[{ id: 7, name: 'سالم', createdAt: new Date('2026-08-01T09:00:00Z'), committeeName: 'الفجر' }]];
    if (sql.includes('prior_memorization')) return [[]];
    return [[{ studentId: 7, startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 2, taskDate: '2026-09-10' }]];
  };
  const reference = { query: async () => [rows] };
  const [student] = await loadStudentLevels({
    query,
    referenceConnection: reference,
    scope: { filter: (column) => `${column} = ?`, params: [7] },
    acceptedSql: () => '1=1',
    today: '2026-09-27',
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.params), [[7], [7, 7], [7]]);
  assert.equal(student.level.name, 'تأهيل 1');
  assert.equal(student.since, '2026-08-01');
  assert.equal(student.days, 57);
});

test('the student header shows the level and the statistics split the students by level', async () => {
  const [home, header, server, metrics, card] = await Promise.all([
    read('../src/components/portal/home/StudentHome.jsx'),
    read('../src/components/portal/home/StudentHomeHeader.jsx'),
    read('../server/index.js'),
    read('../src/components/dashboard/reports/reportMetrics.js'),
    read('../src/components/dashboard/reports/MetricCard.jsx'),
  ]);
  assert.match(home, /progress=\{level\?\.progressPercent\} levelName=\{level\?\.name\}/);
  assert.doesNotMatch(home, /currentPlanProgress|تقدم الخطة الحالية/);
  assert.match(header, /<span className="student-home-level-name">\{levelName\}<\/span>/);
  assert.match(server, /app\.get\('\/api\/students\/:id\/quran-level'/);
  assert.match(server, /studentLevels: await loadStudentLevels\(\{/);
  assert.match(metrics, /studentLevelsMetric\(overview, inCommittee\),\s*committeesCountMetric/);
  assert.match(metrics, /narrationMetric\(grades\.narration, inCommittee, filtered\)/);
  assert.doesNotMatch(metrics, /studentsCountMetric|label: 'عدد الطلاب'/);
  assert.match(metrics, /sort\(\(a, b\) => Number\(b\.days \|\| 0\) - Number\(a\.days \|\| 0\)/);
  assert.match(card, /metric\.segments \? <SegmentedMetricCard/);
});
