import { STUDENT_LEVELS, STUDENT_LEVEL_GROUPS, studentLevelShare } from '../../../../shared/student-levels.js';
import type { ReportManagementQuery, ReportPerformancePoint, ReportPeriodKey } from '../../domain/reportManagement';
import { formatReportNumber, formatReportFaces, reportPeriodRange, reportPercent as ratioPercentage } from '../../domain/reportManagement';
import { performanceChartData, PERFORMANCE_LINES } from '../../../../src/components/dashboard/reports/performanceChartData.js';

export type PerformanceKey = 'memorization' | 'review' | 'link' | 'repeat' | 'reading' | 'percentage';
export function reportPerformanceData(series: readonly ReportPerformancePoint[]) {
  const calculated = performanceChartData([...series]) as { points: (ReportPerformancePoint & Partial<Record<PerformanceKey, number | null>>)[];
    keys: PerformanceKey[]; upper: number; ticks: number[] };
  const points = calculated.points.map(point => ({ ...point, values: Object.fromEntries((Object.keys(PERFORMANCE_LINES) as PerformanceKey[]).map(key => [key, point[key] ?? null])) as Partial<Record<PerformanceKey, number | null>> }));
  return { points, keys: calculated.keys, upper: calculated.upper, ticks: calculated.ticks };
}
export function rolledReportQuery(query: ReportManagementQuery, period: ReportPeriodKey, today: string): ReportManagementQuery {
  if (query.archiveId || period === 'custom') return query;
  const range = reportPeriodRange(period, {}, today);
  return range.from === query.from && range.to === query.to ? query : { ...query, ...range };
}

export type ReportTone = 'good' | 'warn' | 'bad' | 'neutral';
export type ReportStat = { label: string; value: string; tone?: ReportTone };
export type ReportRecord = { label: string; note?: string; value?: string; tone?: ReportTone; stats?: ReportStat[]; series?: ReportPerformancePoint[] };
export type ReportRecordGroup = { key?: string; title: string; rows: ReportRecord[]; emptyText?: string };
export type ReportTile = { label: string; value: number; display: string; color?: string };
export type ReportLevel = { key: string; name: string; color: string; count: number; share: number };
export type ReportMetric = { id: string; label: string; value: number; display: string; color: string; countValue?: number;
  tiles: ReportTile[]; records: ReportRecordGroup[]; bars?: { title: string; rows: { label: string; percent: number }[] }[];
  segments?: { key: string; label: string; color: string; count: number; share: number }[];
  levelGroups?: { key: string; name: string; color: string; count: number; levels: ReportLevel[] }[]; loading?: boolean; error?: string };

export const reportNumber = formatReportNumber;
export const reportFaces = formatReportFaces;
export const reportPercent = (part: number | null | undefined, total: number | null | undefined) => ratioPercentage(Number(part || 0), Number(total || 0));
export const reportTone = (percentage: number): ReportTone => percentage >= 80 ? 'good' : percentage >= 50 ? 'warn' : 'bad';
const gradeColor = (percentage: number) => percentage >= 80 ? '#059669' : percentage >= 50 ? '#d97706' : '#dc2626';
export const reportRatio = (label: string, done: number | null | undefined, total: number | null | undefined, faces = false): ReportStat => ({
  label, value: `${faces ? reportFaces(done) : reportNumber(done)} من ${faces ? reportFaces(total) : reportNumber(total)}`,
  tone: Number(total) > 0 ? reportTone(reportPercent(done, total)) : 'neutral',
});
export const reportPercentageStat = (label: string, done: number | null | undefined, total: number | null | undefined): ReportStat => ({
  label, value: `${reportNumber(reportPercent(done, total))}%`, tone: Number(total) > 0 ? reportTone(reportPercent(done, total)) : 'neutral',
});
export const percentageTile = (label: string, value: number): ReportTile => ({ label, value: Math.round(value), display: `${reportNumber(Math.round(value))}%`, color: gradeColor(value) });
export const countTile = (label: string, count: number | null | undefined, faces = false): ReportTile => ({ label,
  value: Number(count || 0) > 0 ? 100 : 0, display: faces ? reportFaces(count) : reportNumber(count) });
export const reportLevelGroups = STUDENT_LEVEL_GROUPS;
export const reportLevels = STUDENT_LEVELS;
export const reportLevelShare = studentLevelShare;

/** Match the website's color-mix(in oklab, ...) on renderers without CSS colours. */
export function reportLevelColor(color: string, share: number, background: string) {
  const toLab = (value: string) => {
    const [r, g, b] = [1, 3, 5].map(index => {
      const channel = Number.parseInt(value.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  };
  const base = toLab(color), back = toLab(background), ratio = Math.max(0, Math.min(100, share)) / 100;
  const [light, a, b] = base.map((value, index) => value * ratio + back[index]! * (1 - ratio)) as [number, number, number];
  const l = (light + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (light - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (light - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return `#${[4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(channel => {
    const srgb = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255).toString(16).padStart(2, '0');
  }).join('')}`;
}

type MetricValue = { done?: number; total?: number };
type MetricStudent = { id: number; name: string; metrics?: Partial<Record<'attendance' | 'memorization' | 'mastery' | 'review' | 'link', MetricValue>> };
type MetricGradeRow = { id: number; name: string; committeeName?: string; grade?: number; max?: number; percentage?: number | null;
  attended?: number; absent?: number; late?: number; excused?: number; expectedWeeks?: number; weeks?: number;
  segments?: Partial<Record<'tested' | 'compensated' | 'mistakes' | 'warnings' | 'hesitations' | 'grade' | 'max', number>> };
type MetricSession = { percentage?: number; studentsList?: MetricGradeRow[]; attended?: number; expectedAttendance?: number;
  committees?: { name: string; percentage: number }[]; segments?: MetricGradeRow['segments'] };
export type ReportMetricSource = {
  committeeIndicators?: { name: string; studentsCount: number; students?: MetricStudent[] }[];
  totals?: { familiesCount?: number; quranFaces?: Partial<Record<'memorization' | 'mastery' | 'review' | 'link', number>> };
  attendance?: { students?: { present?: number; late?: number; excused?: number; total?: number } };
  grades?: { weeklyProgram?: MetricSession | null; weeklySession?: MetricSession | null; trackSession?: MetricSession | null;
    reading?: { hizbs?: number; byStudent?: Record<string, { hizbs?: number }> } };
  branchPassing?: { expected: number; tested: number; studentsList: { name: string; committeeName?: string; tested: boolean; juzNumbers?: number[] }[] } | null;
  studentLevels?: { id: number; name: string; committeeName?: string; level?: { key?: string; group?: string } | null }[];
  teachers?: { id: number; name: string; committees?: string }[];
  planPerformance?: { students?: { studentId: number; series: ReportPerformancePoint[] }[]; series?: ReportPerformancePoint[] };
};
export type ReportTeacherPoint = { studentName: string; committeeName?: string; type: string; points: number; reason?: string; transactionDate?: string; teacherName?: string };
const colors = { weeklyProgram: '#0d9488', weeklySession: '#ea580c', trackSession: '#2563eb', branchPassing: '#e11d48', levels: '#2a78d6', committees: '#4f46e5', points: '#dc2626' };
const percentValue = (value: number) => ({ value: Math.round(value), display: `${reportNumber(Math.round(value))}%` });
const totalOf = <T,>(rows: readonly T[], read: (row: T) => number | undefined) => rows.reduce((total, row) => total + Number(read(row) || 0), 0);
const expectedWeeks = (row: MetricGradeRow) => Number(row.expectedWeeks ?? ((row.attended || 0) + (row.absent || 0)));
const byName = (first: { name: string }, second: { name: string }) => first.name.localeCompare(second.name, 'ar');
const sessionBars = (data: MetricSession, filtered: boolean) => [{ title: 'الحلقات', rows: !filtered && (data.committees?.length ?? 0) > 1
  ? data.committees!.map(row => ({ label: row.name, percent: row.percentage })) : [] }];

/** Card values keep the page scope; the circle selector narrows only the details, as on the website. */
export function buildNativeReportMetrics(overview: ReportMetricSource | null, { showStandard = true, showTeacherPoints = false,
  teacherPoints, committee = 'all', weeklySession = true, trackSession = true, legacy = false }: {
  showStandard?: boolean; showTeacherPoints?: boolean; teacherPoints?: { rows: ReportTeacherPoint[]; error?: string; loading?: boolean } | null;
  committee?: string; weeklySession?: boolean; trackSession?: boolean; legacy?: boolean;
} = {}): ReportMetric[] {
  const metrics: ReportMetric[] = []; const filtered = committee !== 'all'; const inCommittee = (name?: string) => !filtered || name === committee;
  if (showStandard && overview) {
    const students = (overview.committeeIndicators ?? []).flatMap(circle => (circle.students ?? []).map(student => ({ ...student, committeeName: circle.name })))
      .filter(student => inCommittee(student.committeeName));
    const program = overview.grades?.weeklyProgram ?? {}; const reading = overview.grades?.reading ?? {};
    const readingOf = (student: MetricStudent) => Number(reading.byStudent?.[String(student.id)]?.hizbs || 0);
    const quranFaces = filtered ? Object.fromEntries(['memorization', 'mastery', 'review', 'link'].map(key => [key,
      totalOf(students, student => student.metrics?.[key as 'memorization' | 'mastery' | 'review' | 'link']?.done)])) : overview.totals?.quranFaces ?? {};
    const attendance = filtered ? { present: totalOf(students, student => student.metrics?.attendance?.done), total: totalOf(students, student => student.metrics?.attendance?.total) }
      : overview.attendance?.students ?? {};
    const gradesById = new Map((program.studentsList ?? []).map(row => [row.id, row]));
    metrics.push({ id: 'weeklyProgram', label: 'البرنامج الأسبوعي', color: colors.weeklyProgram, ...percentValue(program.percentage ?? 0),
      tiles: [percentageTile('الحضور', reportPercent((attendance.present ?? 0) + ('late' in attendance ? attendance.late ?? 0 : 0) + ('excused' in attendance ? attendance.excused ?? 0 : 0), attendance.total)),
        countTile('أوجه الحفظ', quranFaces.memorization, true), countTile('أوجه الإتقان', quranFaces.mastery, true), countTile('المراجعة', quranFaces.review, true),
        countTile('الربط', quranFaces.link, true), countTile('أحزاب القراءة الذاتية', filtered ? totalOf(students, readingOf) : reading.hizbs)],
      bars: sessionBars(program, filtered), records: [{ title: 'الطلاب', emptyText: 'لا يوجد طلاب', rows: students.map(student => ({ student, grade: gradesById.get(student.id) }))
        .sort((first, second) => (second.grade?.percentage ?? -1) - (first.grade?.percentage ?? -1) || byName(first.student, second.student))
        .map(({ student, grade }) => ({ label: student.name, note: student.committeeName, value: grade ? `${reportNumber(grade.grade)} من ${reportNumber(grade.max)}` : '—',
          tone: grade ? reportTone(grade.percentage ?? 0) : 'neutral', stats: [reportRatio('الحضور', student.metrics?.attendance?.done, student.metrics?.attendance?.total),
            reportRatio('أوجه الحفظ', student.metrics?.memorization?.done, student.metrics?.memorization?.total, true),
            reportRatio('أوجه الإتقان', student.metrics?.mastery?.done, student.metrics?.mastery?.total, true),
            reportRatio('المراجعة', student.metrics?.review?.done, student.metrics?.review?.total, true), reportRatio('الربط', student.metrics?.link?.done, student.metrics?.link?.total, true),
            { label: 'أحزاب القراءة الذاتية', value: reportNumber(readingOf(student)) }] })) }] });
    if (weeklySession) {
      const data: MetricSession = overview.grades?.weeklySession ?? {}; const rows = (data.studentsList ?? []).filter(row => inCommittee(row.committeeName));
      const attended = filtered ? totalOf(rows, row => row.attended) : data.attended;
      const expected = filtered ? totalOf(rows, expectedWeeks) : data.expectedAttendance ?? totalOf(rows, expectedWeeks);
      metrics.push({ id: 'weeklySession', label: 'الجلسة الأسبوعية', color: colors.weeklySession, ...percentValue(reportPercent(attended, expected)),
        tiles: [countTile('عدد الحضور', attended), percentageTile('نسبة الحضور', reportPercent(attended, expected))], bars: sessionBars(data, filtered),
        records: [{ title: 'الطلاب', emptyText: 'لا توجد درجات مرصودة في هذه الفترة', rows: rows.map(row => ({ label: row.name, note: row.committeeName || 'بدون حلقة',
          value: `${reportNumber(reportPercent(row.attended, expectedWeeks(row)))}%`, tone: expectedWeeks(row) > 0 ? reportTone(reportPercent(row.attended, expectedWeeks(row))) : 'neutral',
          stats: [reportRatio('عدد الحضور', row.attended, expectedWeeks(row)), reportPercentageStat('نسبة الحضور', row.attended, expectedWeeks(row)),
            ...(Number(row.late) > 0 ? [{ label: 'متأخر', value: reportNumber(row.late) }] : []), ...(Number(row.excused) > 0 ? [{ label: 'مستأذن', value: reportNumber(row.excused) }] : [])] })) }] });
    }
    if (trackSession) {
      const data: MetricSession = overview.grades?.trackSession ?? {}; const rows = (data.studentsList ?? []).filter(row => inCommittee(row.committeeName));
      const segmentKeys = ['tested', 'compensated', 'mistakes', 'warnings', 'hesitations', 'grade', 'max'] as const;
      const segments = filtered ? Object.fromEntries(segmentKeys.map(key => [key, totalOf(rows, row => row.segments?.[key])])) : data.segments ?? {};
      const attended = filtered ? totalOf(rows, row => row.attended) : data.attended;
      const expected = filtered ? totalOf(rows, expectedWeeks) : data.expectedAttendance ?? totalOf(rows, expectedWeeks);
      metrics.push({ id: 'trackSession', label: 'جلسة المسار', color: colors.trackSession, ...percentValue(reportPercent(segments.grade, segments.max)),
        tiles: [percentageTile('الحضور', reportPercent(attended, expected)), percentageTile('نسبة إتقان الحفظ', reportPercent(segments.grade, segments.max)),
          countTile('الأخطاء', segments.mistakes), countTile('التنبيهات', segments.warnings), countTile('الترددات', segments.hesitations), countTile('المقاطع المعوضة', segments.compensated)],
        records: [{ title: 'الطلاب', emptyText: 'لا توجد درجات مرصودة في هذه الفترة', rows: rows.map(row => {
          const value = Number(row.segments?.compensated) > 0 ? { value: 'تعويض', tone: 'good' as const }
            : !Number(row.attended) && Number(row.excused) > 0 && !Number(row.absent) ? { value: 'مستأذن', tone: 'neutral' as const }
              : !Number(row.attended) && Number(row.absent) > 0 ? { value: 'غائب', tone: 'bad' as const }
                : !Number(row.segments?.tested) ? { value: Number(row.attended) > 0 ? `${reportNumber(row.grade)} من ${reportNumber(row.max)} · لم يُختبر` : 'غير مرصود', tone: 'neutral' as const }
                  : { value: `${reportNumber(reportPercent(row.segments?.grade, row.segments?.max))}%`, tone: reportTone(reportPercent(row.segments?.grade, row.segments?.max)) };
          return { label: row.name, note: row.committeeName || 'بدون حلقة', ...value, stats: [reportPercentageStat('الحضور', row.attended, expectedWeeks(row)),
            ...(Number(row.late) > 0 ? [{ label: 'متأخر', value: reportNumber(row.late) }] : []), ...(Number(row.excused) > 0 ? [{ label: 'مستأذن', value: reportNumber(row.excused) }] : []),
            reportPercentageStat('نسبة إتقان الحفظ', row.segments?.grade, row.segments?.max), { label: 'الأخطاء', value: reportNumber(row.segments?.mistakes) },
            { label: 'التنبيهات', value: reportNumber(row.segments?.warnings) }, { label: 'الترددات', value: reportNumber(row.segments?.hesitations) }] };
        }) }] });
    }
    const branch = overview.branchPassing; const branchRows = branch?.studentsList.filter(row => inCommittee(row.committeeName)) ?? [];
    const expected = filtered ? branchRows.length : branch?.expected ?? 0; const tested = filtered ? branchRows.filter(row => row.tested).length : branch?.tested ?? 0;
    metrics.push({ id: 'branchPassing', label: 'اختبارات الاجتياز الفرعي', color: colors.branchPassing,
      value: branch ? reportPercent(branch.tested, branch.expected) : 0, display: branch ? branch.expected ? `${reportNumber(reportPercent(branch.tested, branch.expected))}%` : '—' : 'غير متاح',
      tiles: [countTile('المستحقون للاختبار', expected), countTile('اختُبروا', tested), countTile('لم يُختبروا', expected - tested)], records: [{ title: 'الطلاب',
        emptyText: 'لا يوجد طلاب مستحقون للاختبار في هذه الفترة.', rows: branchRows.map(row => ({ label: row.name, note: row.committeeName || 'بدون حلقة',
          value: row.tested ? 'اختُبر' : 'لم يُختبر', tone: row.tested ? 'good' : 'warn', stats: [{ label: 'الأجزاء', value: (row.juzNumbers ?? []).map(reportNumber).join('، ') }] })) }] });
    const levelStudents = overview.studentLevels ?? []; const detailStudents = levelStudents.filter(student => inCommittee(student.committeeName));
    const performance = new Map((overview.planPerformance?.students ?? []).map(student => [student.studentId, student.series]));
    metrics.push({ id: 'levels', label: 'الطلاب', color: colors.levels, value: levelStudents.length ? 100 : 0,
      countValue: levelStudents.length, display: overview.studentLevels ? reportNumber(levelStudents.length) : 'غير متاح', tiles: [],
      segments: reportLevels.map(level => ({ key: level.key, label: level.name, color: level.color, share: reportLevelShare(level), count: levelStudents.filter(student => student.level?.key === level.key).length })),
      levelGroups: reportLevelGroups.map(group => ({ ...group, name: ({ taheel: 'التأهيل', nujaba: 'النجباء', fursan: 'الفرسان', huffaz: 'الحفاظ', khirijeen: 'الخريجين' } as Record<string, string>)[group.key]!,
        count: detailStudents.filter(student => student.level?.group === group.key || reportLevels.some(level => level.group === group.key && level.key === student.level?.key)).length,
        levels: reportLevels.filter(level => level.group === group.key).map(level => ({ key: level.key, name: level.name, color: level.color, share: reportLevelShare(level),
          count: detailStudents.filter(student => student.level?.key === level.key).length })) })),
      records: reportLevels.filter(level => detailStudents.some(student => student.level?.key === level.key)).map(level => ({ key: level.key, title: level.name,
        rows: detailStudents.filter(student => student.level?.key === level.key).sort((first, second) =>
          (performance.get(first.id)?.at(-1)?.percentage ?? Infinity) - (performance.get(second.id)?.at(-1)?.percentage ?? Infinity) || byName(first, second))
          .map(student => ({ label: student.name, series: performance.get(student.id) ?? [] })) })) });
    const circles = (overview.committeeIndicators ?? []).filter(circle => inCommittee(circle.name));
    metrics.push({ id: 'committees', label: 'عدد الحلقات', color: colors.committees, value: overview.totals?.familiesCount ? 100 : 0,
      display: reportNumber(overview.totals?.familiesCount), countValue: overview.totals?.familiesCount, tiles: [countTile('الحلقات', circles.length), countTile('الطلاب', totalOf(circles, circle => circle.studentsCount))],
      records: [{ title: 'الحلقات', emptyText: 'لا توجد حلقات', rows: [...circles].sort(byName).map(circle => ({ label: circle.name,
        note: (overview.teachers ?? []).filter(teacher => (teacher.committees ?? '').split('، ').includes(circle.name)).map(teacher => teacher.name).join('، ') || 'بدون مشرف المسار',
        value: `${reportNumber(circle.studentsCount)} طالب` })) }] });
  }
  if (showTeacherPoints) {
    const allRows = teacherPoints?.rows ?? []; const rows = allRows.filter(row => inCommittee(row.committeeName));
    const increase = allRows.filter(row => row.type === 'increase').length; const filteredIncrease = rows.filter(row => row.type === 'increase').length;
    metrics.push({ id: 'points', label: 'الإضافة والخصم', color: colors.points, value: reportPercent(increase, allRows.length), display: reportNumber(allRows.length), countValue: allRows.length,
      loading: teacherPoints?.loading, error: teacherPoints?.error, tiles: [countTile('إضافة', filteredIncrease), countTile('خصم', rows.length - filteredIncrease)],
      records: [{ title: 'العمليات', rows: rows.map(row => ({ label: row.studentName, note: [row.reason, row.transactionDate, row.teacherName].filter(Boolean).join(' · '),
        value: `${row.type === 'increase' ? '+' : '-'}${reportFaces(row.points)}`, tone: row.type === 'increase' ? 'good' : 'bad' })) }] });
  }
  return metrics.map(metric => {
    if (!legacy) return metric;
    const unavailable = metric.id === 'weeklyProgram' && overview?.grades?.weeklyProgram?.percentage === undefined
      || metric.id === 'weeklySession' && (!overview?.grades?.weeklySession || overview.grades.weeklySession.expectedAttendance === undefined && !overview.grades.weeklySession.studentsList)
      || metric.id === 'trackSession' && !overview?.grades?.trackSession?.segments
      || metric.id === 'branchPassing' && !overview?.branchPassing
      || metric.id === 'levels' && !overview?.studentLevels;
    if (unavailable) return { ...metric, value: 0, display: 'غير متاح', countValue: undefined, tiles: [], records: [], bars: [], segments: undefined, levelGroups: undefined };
    if (metric.id === 'committees' && overview?.totals?.familiesCount === undefined) return { ...metric, display: 'غير متاح', countValue: undefined };
    if (metric.id === 'weeklyProgram') return { ...metric, tiles: metric.tiles.map(tile => {
      const quranKeys: Record<string, 'memorization' | 'mastery' | 'review' | 'link'> = { 'أوجه الحفظ': 'memorization', 'أوجه الإتقان': 'mastery', 'المراجعة': 'review', 'الربط': 'link' };
      const absent = tile.label === 'الحضور' && !overview?.attendance?.students && !filtered
        || tile.label === 'أحزاب القراءة الذاتية' && !overview?.grades?.reading
        || !filtered && !!quranKeys[tile.label] && overview?.totals?.quranFaces?.[quranKeys[tile.label]!] === undefined;
      return absent ? { ...tile, display: 'غير متاح' } : tile;
    }) };
    return metric;
  });
}
