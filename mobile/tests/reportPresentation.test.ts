import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STUDENT_LEVELS, STUDENT_LEVEL_GROUPS, studentLevelShare } from '../../shared/student-levels.js';
import { formatStatisticsNumber } from '../../src/lib/statisticsNumber.js';
import { buildNativeReportMetrics, reportPerformanceData, rolledReportQuery, type ReportMetric, type ReportMetricSource } from '../src/components/reports/reportPresentation';
import { reportPeriodRange, type ReportManagementData, type ReportManagementQuery, type ReportPerformancePoint } from '../src/domain/reportManagement';
import { getSaudiCalendarDate } from '../../shared/business-date.js';
import { hijriParts, parseDateOnly } from '../../shared/hijri-calendar.js';
import { reportRowSections, type ReportFieldSection } from '../src/components/reports/reportDetails';
import { createReportReadState } from '../src/components/reports/reportReadState';
import { NativeApiError } from '../src/services/nativeApi';

const source = readFileSync(join(__dirname, '../../src/components/dashboard/reports/reportMetrics.js'), 'utf8');
const context = vm.createContext({ STUDENT_LEVELS, STUDENT_LEVEL_GROUPS, studentLevelShare, formatNumber: formatStatisticsNumber,
  ...Object.fromEntries(['BookMarked', 'Building2', 'CalendarCheck2', 'CalendarRange', 'GraduationCap', 'PlusCircle', 'Route'].map(key => [key, key])) });
vm.runInContext(source.replace(/import[\s\S]*?;/g, '').replace(/export /g, ''), context);
const web = vm.runInContext('(overview, options) => buildReportMetrics(overview, options)', context) as
  (overview: ReportMetricSource, options?: { committee?: string; showStandard?: boolean; showTeacherPoints?: boolean; lists?: { teacherPoints: { rows: object[] } } }) => ReportMetric[];
function summaries(metrics: ReportMetric[]) {
  // Presentation colours/icons differ by renderer; numeric meanings and the exposed records must match.
  return JSON.parse(JSON.stringify(metrics.map(metric => ({ id: metric.id, label: metric.label, display: metric.display, value: metric.value,
    tiles: metric.tiles.map(tile => ({ label: tile.label, display: tile.display, value: tile.value })),
    records: metric.records.map(group => ({ key: group.key, title: group.title, rows: group.rows.map(row => ({ label: row.label, note: row.note, value: row.value,
      stats: row.stats?.map(stat => ({ label: stat.label, value: stat.value })), series: row.series })) })) }))));
}
function parity(overview: ReportMetricSource, committee = 'all') {
  assert.deepEqual(summaries(buildNativeReportMetrics(overview, { committee })), summaries(web(overview, { committee })));
}
const sessions = [
  { id: 1, name: 'الأول', committeeName: 'الفجر', expectedWeeks: 2, attended: 1, absent: 0, late: 1, excused: 0, grade: 100, max: 100,
    segments: { tested: 1, grade: 8, max: 10, mistakes: 1, warnings: 2, hesitations: 3 } },
  { id: 2, name: 'الثاني', committeeName: 'العصر', expectedWeeks: 2, attended: 0, absent: 1, late: 0, excused: 0, grade: 100, max: 100,
    segments: { tested: 1, grade: 4, max: 10, mistakes: 2, warnings: 0, hesitations: 1 } },
];
test('weekly attendance and track tested-segment denominators match the website, including unrecorded weeks', () => {
  const overview = { grades: { weeklySession: { expectedAttendance: 4, attended: 1, percentage: 100, studentsList: sessions },
    trackSession: { expectedAttendance: 4, attended: 1, percentage: 100, segments: { tested: 2, grade: 12, max: 20 }, studentsList: sessions } } };
  parity(overview); parity(overview, 'الفجر'); parity(overview, 'غير موجود');
  assert.equal(buildNativeReportMetrics(overview).find(metric => metric.id === 'weeklySession')?.display, '25%');
  assert.equal(buildNativeReportMetrics(overview).find(metric => metric.id === 'trackSession')?.display, '60%');
});
test('compensation and excused attendance keep their labels, with an untested segment excluded from accuracy', () => {
  const overview = { grades: { trackSession: { studentsList: [
    { ...sessions[0]!, segments: { tested: 0, compensated: 1, grade: 10, max: 10 } },
    { ...sessions[1]!, absent: 0, excused: 1, segments: { tested: 0, grade: 0, max: 0 } },
  ], segments: { tested: 0, compensated: 1, grade: 10, max: 10 } } } };
  parity(overview); const track = buildNativeReportMetrics(overview).find(metric => metric.id === 'trackSession')!;
  assert.equal(track.records[0]?.rows[0]?.value, 'تعويض'); assert.equal(track.records[0]?.rows[1]?.value, 'مستأذن');
});
test('program face ratios and reading Quran ahzab remain distinct and circle details use their actual values', () => {
  const overview = { grades: { weeklyProgram: { percentage: 71, studentsList: [{ id: 1, name: 'طالب', grade: 5, max: 7, percentage: 71 }] },
    reading: { hizbs: 5, byStudent: { '1': { hizbs: 2 }, '2': { hizbs: 3 } } } },
    committeeIndicators: [{ name: 'الفجر', studentsCount: 1, students: [{ id: 1, name: 'طالب', metrics: { attendance: { done: 1, total: 2 }, memorization: { done: 0.5, total: 1.5 }, review: { done: 0, total: 0 } } }] },
      { name: 'العصر', studentsCount: 1, students: [{ id: 2, name: 'آخر' }] }],
    totals: { quranFaces: { memorization: 0.5, mastery: 0, review: 0, link: 0 }, familiesCount: 2 }, attendance: { students: { present: 1, late: 1, excused: 1, total: 4 } } };
  parity(overview); parity(overview, 'الفجر');
  const program = buildNativeReportMetrics(overview, { committee: 'الفجر' })[0]!;
  assert.equal(program.records[0]?.rows[0]?.stats?.[1]?.value, '0.5 من 1.5'); assert.equal(program.tiles.at(-1)?.display, '2');
});
test('branch card keeps page totals while selected-circle details count only its eligible students', () => {
  const overview = { branchPassing: { expected: 10, tested: 5, studentsList: [
    { name: 'الأول', committeeName: 'الفجر', tested: true, juzNumbers: [1] },
    { name: 'الثاني', committeeName: 'الفجر', tested: false, juzNumbers: [1, 2] },
    { name: 'الثالث', committeeName: 'العصر', tested: true, juzNumbers: [2] },
  ] }, studentLevels: [] };
  parity(overview); parity(overview, 'الفجر');
  const branch = buildNativeReportMetrics(overview, { committee: 'الفجر' }).find(metric => metric.id === 'branchPassing')!;
  assert.equal(branch.display, '50%'); assert.deepEqual(branch.tiles.map(tile => tile.display), ['2', '1', '1']);
});
test('level records keep the website ordering and each student performance series', () => {
  const series = (percentage: number): ReportPerformancePoint[] => [{ date: '2026-10-14', done: percentage / 100, expected: 1, percentage, components: {} }];
  const overview = { studentLevels: [{ id: 1, name: 'مرتفع', committeeName: 'الفجر', level: { key: 'taheel-1', group: 'taheel' } },
    { id: 2, name: 'متأخر', committeeName: 'الفجر', level: { key: 'taheel-1', group: 'taheel' } }],
    planPerformance: { students: [{ studentId: 1, series: series(90) }, { studentId: 2, series: series(40) }] } };
  parity(overview); const level = buildNativeReportMetrics(overview).find(metric => metric.id === 'levels')!;
  assert.deepEqual(level.records[0]?.rows.map(row => row.label), ['متأخر', 'مرتفع']);
});
test('teacher point records keep transaction counts and signs instead of treating them as balances', () => {
  const rows = [{ studentName: 'الأول', committeeName: 'الفجر', type: 'increase', points: 0.5, reason: 'سبب', transactionDate: '2026-10-14', teacherName: 'مشرف' },
    { studentName: 'الثاني', committeeName: 'العصر', type: 'deduction', points: 2 }];
  for (const committee of ['all', 'الفجر']) {
    assert.deepEqual(summaries(buildNativeReportMetrics({}, { committee, showStandard: false, showTeacherPoints: true, teacherPoints: { rows } })),
      summaries(web({}, { committee, showStandard: false, showTeacherPoints: true, lists: { teacherPoints: { rows } } })));
  }
});
test('missing legacy metrics stay unavailable and do not fabricate students or program zero grades', () => {
  const metrics = buildNativeReportMetrics({}, { legacy: true });
  for (const id of ['weeklyProgram', 'branchPassing', 'levels', 'committees']) assert.equal(metrics.find(metric => metric.id === id)?.display, 'غير متاح');
  const program = metrics.find(metric => metric.id === 'weeklyProgram')!; assert.deepEqual(program.tiles, []); assert.deepEqual(program.records, []);
});
test('session flags remove the other component from summaries and records', () => {
  const overview = { grades: { weeklySession: { studentsList: sessions }, trackSession: { studentsList: sessions } } };
  const weekly = buildNativeReportMetrics(overview, { trackSession: false }); const track = buildNativeReportMetrics(overview, { weeklySession: false });
  assert.ok(weekly.some(metric => metric.id === 'weeklySession')); assert.ok(!weekly.some(metric => metric.id === 'trackSession'));
  assert.ok(track.some(metric => metric.id === 'trackSession')); assert.ok(!track.some(metric => metric.id === 'weeklySession'));
});
test('a legacy component object without its measured percentage or denominator does not become a zero result', () => {
  const metrics = buildNativeReportMetrics({ grades: { weeklyProgram: {}, weeklySession: {}, trackSession: {} } }, { legacy: true });
  for (const id of ['weeklyProgram', 'weeklySession', 'trackSession']) {
    const metric = metrics.find(row => row.id === id)!; assert.equal(metric.display, 'غير متاح'); assert.deepEqual(metric.records, []);
  }
});
test('chart uses the website calculator for missing targets and component denominators beyond one hundred percent', () => {
  const points: ReportPerformancePoint[] = [
    { date: '2026-10-11', done: 0, expected: 0, percentage: null, components: {} },
    { date: '2026-10-12', done: 3, expected: 2, percentage: 150, components: { memorization: { done: 3, expected: 2 }, review: { done: 1, expected: 0 } } },
    { date: '2026-10-13', done: 4, expected: 2, percentage: 200, components: { memorization: { done: 4, expected: 2 }, review: { done: 0, expected: 0 } } },
  ];
  const chart = reportPerformanceData(points); assert.equal(chart.points.length, 2); assert.deepEqual(chart.keys, ['memorization']);
  assert.equal(chart.upper, 200); assert.deepEqual(chart.ticks, [1, 50, 100, 150, 200]); assert.equal(chart.points[0]?.values.review, null);
  assert.equal(chart.points[0]?.values.memorization, 150);
});
test('named periods roll over at Riyadh civil midnight while custom and archive ranges stay fixed', () => {
  const before = getSaudiCalendarDate(new Date('2026-10-14T20:59:59Z')); const after = getSaudiCalendarDate(new Date('2026-10-14T21:00:00Z'));
  assert.equal(before, '2026-10-14'); assert.equal(after, '2026-10-15');
  const query: ReportManagementQuery = { ...reportPeriodRange('week', {}, before), committeeId: 3, complexId: 2, reportType: 'track' };
  const next = rolledReportQuery(query, 'week', after); assert.equal(next.to, '2026-10-15'); assert.equal(next.committeeId, 3); assert.equal(next.reportType, 'track');
  assert.strictEqual(rolledReportQuery(query, 'custom', after), query);
  const archive = { ...query, archiveId: 7 }; assert.strictEqual(rolledReportQuery(archive, 'month', after), archive);
});
test('month and quarter rollover uses the same Hijri boundary as the website', () => {
  let before = ''; let after = '';
  for (let day = 1; day < 32; day += 1) {
    const start = new Date(Date.UTC(2026, 9, day)); const end = new Date(start.getTime() + 86_400_000);
    if (hijriParts(start).month !== hijriParts(end).month) { before = start.toISOString().slice(0, 10); after = end.toISOString().slice(0, 10); break; }
  }
  assert.ok(before && after); assert.notEqual(hijriParts(parseDateOnly(before)!).month, hijriParts(parseDateOnly(after)!).month);
  for (const period of ['month', 'quarter', 'year'] as const) {
    const query = { ...reportPeriodRange(period, {}, before), committeeId: 'all' as const, complexId: 'all' as const };
    const next = rolledReportQuery(query, period, after); assert.deepEqual({ from: next.from, to: next.to }, reportPeriodRange(period, {}, after));
    if (period === 'month') assert.notEqual(next.from, query.from);
  }
});
function sectionText(sections: readonly ReportFieldSection[]): string {
  return sections.map(section => `${section.label}: ${section.value ?? ''}\n${sectionText(section.children ?? [])}`).join('\n');
}
test('nonempty Quran marks retain selected text, references, kinds and notes without internal identifiers', () => {
  const sections = reportRowSections({ id: 998877, taskId: 556677, teacherRatingLabel: 'جيد', executionState: 'compensation', actualListeningCount: 2,
    preview: 'الفاتحة 1 إلى 7', ayahPreview: 'الفاتحة 1 إلى 7', pagePreview: 'صفحة 1',
    wordMarks: [{ id: 334455, page: 1, startLocation: '1:1:1', endLocation: '1:1:2', selectedText: 'بسم الله', markType: 'mistake', notes: 'constructor' }],
    ayahMarks: [{ surah: 1, surahName: 'الفاتحة', ayah: 1, textUthmani: 'بسم الله', markType: 'lahn', occurrenceCount: 2 }] });
  const text = sectionText(sections); assert.match(text, /أخطاء الكلمات/); assert.match(text, /النص المحدد: بسم الله/);
  assert.match(text, /نوع العلامة: خطأ/); assert.match(text, /نوع العلامة: لحن/); assert.match(text, /الملاحظات: constructor/);
  assert.match(text, /سورة 1، آية 1، موضع 1/); assert.match(text, /التسميع المنفذ: 2/); assert.match(text, /نوع التنفيذ: تعويض/);
  assert.match(text, /مقدار الآيات: الفاتحة/); assert.ok(!/998877|556677|334455|wordMarks|taskId/.test(text));
});
test('nested execution breakdown and compensation audit keep fractional credits and cancellation history', () => {
  const progress = sectionText(reportRowSections({ dailyDetails: [{ date: '2026-10-14', executionBreakdown: { normal: { amountFaces: 0.5 }, compensation: { amountFaces: 1.25 } } }] }));
  assert.match(progress, /تفاصيل التنفيذ/); assert.match(progress, /الأوجه: 0.5/); assert.match(progress, /الأوجه: 1.25/);
  const text = sectionText(reportRowSections({ id: 9955, studentName: 'طالب', scope: 'track', date: '2026-10-11', actorName: 'مشرف', recordedAt: '2026-10-14T16:00:00',
    components: { memorization: { grade: 8.5, max: 10, passed: true } }, cancelledAt: '2026-10-14T17:00:00', cancelledByName: 'مدير', cancellationReason: 'تصحيح' }));
  assert.match(text, /نطاق التعويض: جلسة المسار/); assert.match(text, /الدرجة: 8.5/); assert.match(text, /من ألغى التعويض: مدير/); assert.match(text, /سبب الإلغاء: تصحيح/);
  assert.ok(!text.includes('9955'));
});
test('actual attendance reader statuses distinguish unrecorded and no-session from a recorded absence', () => {
  const unrecorded = sectionText(reportRowSections({ status: 'unrecorded', recordDate: '2026-10-14' }));
  const noSession = sectionText(reportRowSections({ attendanceStatus: 'no_session' }));
  const absent = sectionText(reportRowSections({ status: 'absent', checkInMethod: 'self' }));
  assert.match(unrecorded, /الحالة: غير مرصود/); assert.ok(!unrecorded.includes('غائب'));
  assert.match(noSession, /حالة الحضور: لا توجد جلسة في هذا اليوم/); assert.match(absent, /الحالة: غائب/);
  assert.match(absent, /طريقة التحضير: الحساب/); assert.ok(!/unrecorded|no_session|self/.test(unrecorded + noSession + absent));
});
function verifiedReaderData(query: ReportManagementQuery): ReportManagementData {
  return { query, queryKey: 'same-reader-context', actor: { role: 'admin', id: 1, name: 'إداري' },
    grants: { canViewStandardReports: true, canViewTeacherPoints: false, canManageArchives: true, teacherScoped: false, weeklySession: true, trackSession: true },
    settings: { reportsSectionEnabled: true, teacherManualPointsEnabled: false }, committees: [{ id: 1, name: 'حلقة متحققة', complexId: 1 }],
    complexes: [{ id: 1, name: 'مجمع متحقق' }], archives: [{ id: 1, title: 'أرشيف متحقق', periodFrom: '2026-10-11', periodTo: '2026-10-14', createdAt: '2026-10-14' }],
    archive: null, overview: { totals: { studentsCount: 1, familiesCount: 1, supervisorsCount: 1, studentPoints: 14, familyPoints: 2 } },
    teacherPoints: null, detail: null, reconciledArchiveDeletion: null };
}
test('read recovery retains verified choices after a rejected staff period and a failed network read, then accepts corrected queries', async () => {
  const state = createReportReadState(); const calls: ReportManagementQuery[] = [];
  const api = { async load(query: ReportManagementQuery) {
    calls.push(query); if (query.reportType === 'supervisors' && query.from === '2024-01-01') throw new NativeApiError('validation', 422);
    if (query.reportType === 'recitations') throw new NativeApiError('network'); return verifiedReaderData(query);
  } };
  const initial: ReportManagementQuery = { from: '2026-10-11', to: '2026-10-14', committeeId: 'all', complexId: 'all', reportType: 'overview' };
  state.bind(api);
  const read = async (query: ReportManagementQuery) => { try { const result = await api.load(query); state.accepted(api, result); return result; }
    catch (cause) { state.failed(api, cause); throw cause; } };
  await read(initial); await assert.rejects(read({ ...initial, from: '2024-01-01', reportType: 'supervisors' }));
  assert.equal(state.bind(api)?.committees[0]?.name, 'حلقة متحققة'); assert.ok(!('overview' in state.bind(api)!));
  const corrected = await read({ ...initial, reportType: 'supervisors' }); assert.equal(corrected.query.from, '2026-10-11');
  await assert.rejects(read({ ...initial, reportType: 'recitations' }));
  const switched = await read({ ...initial, reportType: 'saved' }); assert.equal(switched.query.reportType, 'saved'); assert.equal(calls.length, 5);
});
test('authorization failures erase recovery choices and a different API never receives prior identity metadata', () => {
  const query: ReportManagementQuery = { from: '2026-10-11', to: '2026-10-14', committeeId: 'all', complexId: 'all' };
  for (const code of ['forbidden', 'unauthorized', 'cancelled'] as const) {
    const state = createReportReadState(); const api = {}; state.bind(api); state.accepted(api, verifiedReaderData(query));
    assert.equal(state.failed(api, new NativeApiError(code)), true); assert.equal(state.bind(api), null);
  }
  const state = createReportReadState(), first = {}, second = {}; state.bind(first); state.accepted(first, verifiedReaderData(query));
  assert.equal(state.bind(second), null); assert.equal(state.accepted(first, verifiedReaderData(query)), false);
  assert.equal(state.bind(second), null); state.accepted(second, verifiedReaderData(query));
  assert.equal(state.failed(first, new NativeApiError('forbidden')), false); assert.equal(state.bind(second)?.complexes[0]?.name, 'مجمع متحقق');
});
