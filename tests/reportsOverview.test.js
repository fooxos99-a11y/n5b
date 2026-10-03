import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { reportPeriodStart, reportRange } from '../src/lib/reportPeriods.js';
import { getBusinessDate, getSaudiCalendarDate } from '../shared/business-date.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('report periods start on Sunday and the current Hijri month, quarter or year', () => {
  assert.equal(reportPeriodStart('week', '2026-09-24'), '2026-09-20');
  assert.equal(reportPeriodStart('month', '2026-09-24'), '2026-09-12');
  assert.equal(reportPeriodStart('quarter', '2026-09-24'), '2026-09-12');
  assert.equal(reportPeriodStart('year', '2026-09-24'), '2026-06-16');
  assert.deepEqual(reportRange('month', {}, '2026-09-24'), { from: '2026-09-12', to: '2026-09-24' });
  assert.deepEqual(reportRange('custom', { from: '2026-09-10', to: '2026-09-02' }, '2026-09-24'), { from: '2026-09-02', to: '2026-09-10' });
});

test('current month and quarter use Riyadh midnight even before the execution day starts', () => {
  const instant = new Date('2026-09-11T21:05:00Z');
  assert.equal(getBusinessDate(instant), '2026-09-11');
  const today = getSaudiCalendarDate(instant);
  assert.equal(today, '2026-09-12');
  assert.deepEqual(reportRange('month', {}, today), { from: '2026-09-12', to: '2026-09-12' });
  assert.deepEqual(reportRange('quarter', {}, today), { from: '2026-09-12', to: '2026-09-12' });
  for (const [date, from] of [['2026-01-01', '2025-12-21'], ['2026-04-01', '2026-03-20'], ['2026-07-01', '2026-06-16'], ['2026-12-31', '2026-12-10']]) {
    assert.equal(reportPeriodStart('quarter', date), from);
  }
});

test('Hijri periods preserve named boundaries and ISO transport across the year change', () => {
  assert.equal(reportPeriodStart('year', '2026-06-16'), '2026-06-16');
  assert.equal(reportPeriodStart('year', '2026-06-15'), '2025-06-26');
  assert.equal(reportPeriodStart('month', '2026-10-02'), '2026-09-12');
  assert.equal(reportPeriodStart('quarter', '2026-11-01'), '2026-09-12');
  assert.equal(reportPeriodStart('month', 'invalid'), '');
});

test('statistics are indicator cards with details, then the best students and circles and the teachers', async () => {
  const [reports, metrics, card, details, server] = await Promise.all([
    read('../src/components/dashboard/ReportsSection.jsx'),
    read('../src/components/dashboard/reports/reportMetrics.js'),
    read('../src/components/dashboard/reports/MetricCard.jsx'),
    read('../src/components/dashboard/reports/MetricDetails.jsx'),
    read('../server/index.js'),
  ]);
  assert.match(reports, /<MetricCard key=\{metric\.id\} metric=\{metric\}/);
  assert.match(reports, /<RankingPanels bestStudents=\{overview\.bestStudents\} bestCommittees=\{overview\.bestCommittees\} bestComplexes=\{overview\.bestComplexes\}/);
  assert.match(reports, /!teacherScoped && \(\s*<TeachersPanel teachers=\{overview\.teachers\}/);
  assert.doesNotMatch(reports, /FacesTrendChart|RecitationActivity/);
  assert.match(reports, /<SelectLabel>الأرشيف<\/SelectLabel>/);
  assert.doesNotMatch(reports, /تصدير|exportReport|sendReportWhatsApp/);
  assert.match(metrics, /const attendedOf = \(stats = \{\}\) => Number\(stats\.present \|\| 0\) \+ Number\(stats\.late \|\| 0\) \+ Number\(stats\.excused \|\| 0\)/);
  // Attendance, plan completion, recitations and faces read are covered by the weekly program and the track session.
  assert.doesNotMatch(metrics, /label: 'الحضور',\s*icon|label: 'إنجاز الخطط'|label: 'جلسات التسميع'|label: 'الأوجه المقروءة'/);
  // Include attendance and unrecorded students in the overall session indicator.
  assert.match(metrics, /\.\.\.percentMetric\(pct\(attended, expected\)\)/);
  assert.match(metrics, /percentTile\('الحضور', pct\(attendedOf\(attendance\), attendance\.total\)\),\s*countTile\('أوجه الحفظ'[\s\S]*countTile\('أوجه الإتقان'[\s\S]*countTile\('المراجعة'[\s\S]*countTile\('الربط'/);
  assert.match(metrics, /percentTile\('نسبة إتقان الحفظ', pct\(segments\.grade, segments\.max\)\)/);
  assert.doesNotMatch(metrics, /الأخطاء واللحون|المقاطع المختبرة/);
  assert.match(card, /prefers-reduced-motion: reduce/);
  assert.match(card, /min-h-48[^"]*rounded-2xl border border-border bg-card/);
  // Details open in a centred window with small summary cards.
  assert.match(details, /<DialogTitle className="truncate text-base">تفاصيل \{metric\.label\}<\/DialogTitle>/);
  assert.match(details, /<MetricTile key=\{tile\.label\} tile=\{tile\} color=\{metric\.color\} \/>/);
  assert.doesNotMatch(details, /Sheet/);
  // Every details window filters its students by circle, all circles by default.
  assert.match(details, /committees\.length > 1 && \([\s\S]*aria-label="الحلقة"[\s\S]*<SelectItem value=\{ALL_COMMITTEES\}>كل الحلقات<\/SelectItem>/);
  assert.match(reports, /setDetailCommittee\(ALL_COMMITTEES\); setSelectedId\(item\.id\);/);
  assert.match(metrics, /const inCommittee = \(name\) => !filtered \|\| name === committee;/);
  assert.doesNotMatch(metrics, /'المرصود'/);
  assert.match(server, /\.\.\.await buildOverviewRankings\(reportDb, \{ from: startDate, to: endDate, attendanceDates, attendanceWeekDays, grades \}\)/);
});

test('statistics replace the reports name and lead the management sidebar', async () => {
  const [dashboard, permissions, portal, metrics] = await Promise.all([
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/lib/dashboardPermissions.js'),
    read('../src/pages/AccountPortal.jsx'),
    read('../src/components/dashboard/reports/reportMetrics.js'),
  ]);
  assert.match(dashboard, /\{ key: 'reports', label: 'الإحصائيات', icon: BarChart3 \}/);
  assert.match(dashboard, /const managementSectionOrder = new Map\(\[\s*\['reports', -1\]/);
  assert.match(permissions, /\{ key: 'reports', label: 'الإحصائيات' \}/);
  assert.match(portal, /label: 'إحصائيات الحلقة'/);
  assert.doesNotMatch(dashboard + permissions + portal, /'التقارير'|تقارير الحلقة/);
  assert.doesNotMatch(metrics, /تحضير الكادر/);
});

test('management has no mushaf page, teachers keep theirs', async () => {
  const [dashboard, clientPermissions, serverPermissions] = await Promise.all([
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/lib/dashboardPermissions.js'),
    read('../server/services/dashboardPermissions.js'),
  ]);
  assert.match(dashboard, /if \(section\.key === 'mushaf'\) return isSupervisor;/);
  assert.doesNotMatch(clientPermissions, /'mushaf'/);
  assert.doesNotMatch(serverPermissions, /'mushaf'/);
});

test('a changed plan can be recited again the same day', async () => {
  const { recitedUnderEarlierPlan } = await import('../server/services/offlineRecitation.js');
  assert.equal(recitedUnderEarlierPlan({ planId: 4, planVersion: 1 }, { planId: 4 }, 2), true);
  assert.equal(recitedUnderEarlierPlan({ planId: 4, planVersion: 2 }, { planId: 9 }, 1), true);
  assert.equal(recitedUnderEarlierPlan({ planId: 4, planVersion: 2 }, { planId: 4 }, 2), false);
  assert.equal(recitedUnderEarlierPlan({ sessionId: 'x' }, { planId: 4 }, 2), false);
  const store = await read('../src/services/offlineRecitationStore.js');
  assert.match(store, /recitationPlanKey\(row\.tasks\) === recitationPlanKey\(value\.tasks\)/);
});

test('teachers record self reading in the recitation session, reading-only days included', async () => {
  const [{ isReadingDay, normalizeReadingFaces }, server, list, dialog, metrics] = await Promise.all([
    import('../server/services/selfReading.js'),
    read('../server/index.js'),
    read('../src/components/portal/TeacherRecitationTaskList.jsx'),
    read('../src/components/portal/SelfReadingDialog.jsx'),
    read('../src/components/dashboard/reports/reportMetrics.js'),
  ]);
  const policy = { weeklyProgram: { readingDays: [0, 1, 2, 3, 4, 5, 6] } };
  assert.equal(isReadingDay(policy, '2026-09-26'), true);
  assert.equal(isReadingDay({ weeklyProgram: { readingDays: [0] } }, '2026-09-26'), false);
  assert.equal(normalizeReadingFaces('2.6', 10), 2.5);
  assert.equal(normalizeReadingFaces('', 4), 4);
  assert.match(server, /app\.put\('\/api\/supervisors\/:id\/quran-evaluation\/reading'/);
  assert.match(server, /readingOnly: reading\.readingDay,/);
  assert.match(list, /label="الذاتي"/);
  assert.match(dialog, />\s*لم يقرأ\s*</);
  assert.match(dialog, />\s*حفظ القراءة\s*</);
  // Attendance counts the work days; self reading counts the reading days.
  assert.match(server, /const reportProgramPolicy = \(await loadGradingPolicy\(reportDb\)\)\.weeklyProgram;/);
  assert.match(server, /const attendanceWeekDays = reportProgramPolicy\.workDays\.map\(Number\);/);
  assert.match(server, /readingDays: reportProgramPolicy\.readingDays\.map\(Number\)/);
  assert.match(server, /from: startDate, to: minDateOnly\(endDate, today\), workDays: attendanceWeekDays/);
  assert.match(metrics, /countTile\('أحزاب القراءة الذاتية', readingDone\)/);
  assert.match(metrics, /percentStat\('نسبة إتقان الحفظ', row\.segments\?\.grade, row\.segments\?\.max\)/);
});

test('rankings order students by grades, circles by their average and list every teacher', async () => {
  const { buildOverviewRankings } = await import('../server/services/overviewRankings.js');
  const answers = [
    [[{ id: 1, name: 'أحمد', committeeName: 'الفجر', grade: 40 }, { id: 2, name: 'بدر', committeeName: 'العصر', grade: 55 }]],
    [[{ id: 1, name: 'الفجر', studentsCount: 4, grade: 120 }, { id: 2, name: 'العصر', studentsCount: 1, grade: 55 }]],
    [[{ id: 9, name: 'المعلم', committees: 'الفجر' }]],
    [[{ teacherId: 9, attended: 4, late: 1, absent: 1 }]],
    [[{ teacherId: 9, grade: 45, max: 60 }]],
  ];
  const reportDb = { student: () => '1=1', committee: () => '1=1', staff: () => '1=1', query: async () => answers.shift() };
  const result = await buildOverviewRankings(reportDb, { from: '2026-09-20', to: '2026-09-26', attendanceDates: ['a', 'b', 'c', 'd', 'e'], attendanceWeekDays: [0, 1, 2, 3, 4] });
  assert.deepEqual(result.bestStudents.map((row) => row.name), ['بدر', 'أحمد']);
  // A small circle with a better average ranks above a larger one.
  assert.deepEqual(result.bestCommittees.map((row) => [row.name, row.average]), [['العصر', 55], ['الفجر', 30]]);
  assert.deepEqual(result.teachers[0].attendance, { attended: 4, late: 1, absent: 1, expected: 5, percentage: 80 });
  assert.deepEqual(result.teachers[0].achievement, { grade: 45, max: 60, percentage: 75 });
});

test('plans start today or later, a not-started plan can move, and review is by whole ahzab', async () => {
  const [{ splitPageRangesByHizb }, plans] = await Promise.all([
    import('../shared/quran-hizbs.js'),
    read('../src/components/dashboard/StudentPlansSection.jsx'),
  ]);
  // Each hizb is reviewed as its real pages (9 to 14), never a fixed 10 faces.
  const sizes = splitPageRangesByHizb([{ fromPage: 1, toPage: 604 }]).map((range) => range.toPage - range.fromPage + 1);
  assert.equal(sizes.length, 60);
  assert.equal(sizes.reduce((total, size) => total + size, 0), 604);
  assert.ok(sizes.some((size) => size !== 10));
  assert.match(plans, /String\(selectedRow\.plan\.startDate \|\| ''\) < minimumPlanStartDate/);
  assert.match(plans, /min=\{minimumPlanStartDate\}/);
});
