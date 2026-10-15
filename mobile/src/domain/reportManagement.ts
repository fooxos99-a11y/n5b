import { getSaudiCalendarDate } from '../../../shared/business-date.js';
import { parseDateOnly } from '../../../shared/hijri-calendar.js';
import { reportRange, REPORT_PERIOD_LABELS, DEFAULT_REPORT_PERIOD } from '../../../src/lib/reportPeriods.js';
import { formatStatisticsNumber } from '../../../src/lib/statisticsNumber.js';
import type { NativeSession } from './nativeSession';
import { hasManagementGrant } from './management';
import { attendanceAsciiDigits } from './attendanceManagement';
import { NativeApiError } from '../services/nativeApi';

export { REPORT_PERIOD_LABELS, DEFAULT_REPORT_PERIOD };
export type ReportPeriodKey = 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type ReportScopeId = 'all' | number;
export type ReportDetailKind = 'students' | 'supervisors' | 'progress' | 'recitations' | 'saved' | 'studentPoints' | 'weekly' | 'track';
export interface ReportManagementQuery { from: string; to: string; committeeId: ReportScopeId; complexId: ReportScopeId; archiveId?: number; reportType?: 'overview' | ReportDetailKind }
export interface ReportPeriod { from: string; to: string; totalDays?: number; attendanceDaysCount?: number; committeeName?: string; committeeId?: ReportScopeId; mode?: string; quranReferenceMode?: string; studentId?: ReportScopeId; sessionDates?: string[] }
export interface ReportCircle { id: number; name: string; complexId: number | null }
export interface ReportComplex { id: number; name: string }
export interface ReportSettings { reportsSectionEnabled: boolean; teacherManualPointsEnabled: boolean }
export interface ReportGrants { canViewStandardReports: boolean; canViewTeacherPoints: boolean; canManageArchives: boolean; teacherScoped: boolean; weeklySession: boolean; trackSession: boolean }
export interface ReportRatio { done: number; total: number; percentage?: number | null }
export interface ReportSegments { tested: number; total: number; compensated: number; mistakes: number; warnings: number; hesitations: number; grade: number; max: number }
export interface ReportGradeStudent { id: number; name: string; committeeName: string; grade: number; max: number; percentage: number; attendanceDays?: number; expectedWeeks?: number; attended?: number; absent?: number; late?: number; excused?: number; segments?: ReportSegments }
export interface ReportGradeCircle { id: number | null; name: string; grade: number; max: number; percentage: number }
export interface ReportGradeComponent { grade?: number; max?: number; percentage?: number; students?: number; recorded?: number; attended?: number; absent?: number; late?: number; excused?: number; expectedAttendance?: number; committees?: ReportGradeCircle[]; studentsList?: ReportGradeStudent[]; segments?: ReportSegments }
export interface ReportReading { expectedDays: number; expectedByStudent: Record<string, number>; days: number; hizbs: number; byStudent: Record<string, { days: number; faces: number; hizbs: number }> }
export type ReportScalar = string | number | boolean | null;
export type ReportValue = ReportScalar | ReportValue[] | { [key: string]: ReportValue };
export interface ReportDetailRow { [key: string]: ReportValue | undefined; id?: number | string | null; name?: string; studentId?: number | null; studentName?: string; committeeName?: string }
export interface ReportTable { period?: ReportPeriod; rows: ReportDetailRow[]; totals?: { [key: string]: ReportValue }; compensations?: ReportDetailRow[]; effectiveDate?: string; requestedDate?: string; [key: string]: unknown }
export interface ReportAttendanceTotals { present: number; late: number; excused: number; absent: number; total: number; notRecorded?: number; percentage?: number }
export interface ReportIndicatorStudent { id: number; name: string; metrics: Record<string, ReportRatio>; overallPercentage: number }
export interface ReportIndicatorCircle { id: number; name: string; studentsCount: number; metrics: Record<string, ReportRatio>; overallPercentage: number; students: ReportIndicatorStudent[] }
export interface ReportPerformancePoint { date: string; done: number; expected: number; percentage: number | null; shortageFaces?: number; aheadFaces?: number; components: Record<string, { done: number; expected: number }> }
export interface ReportPerformanceStudent { studentId: number; name?: string; committeeName?: string; series: ReportPerformancePoint[] }
export interface ReportStudentLevel { id: number; name: string; committeeName: string; level: { key: string; name: string; progressPercent: number; finished: boolean }; since: string; days: number }
export interface ReportRankingRow { id: number; name: string; grade?: number; max?: number; percentage?: number | null; average?: number; committeeId?: number | null; committeeName?: string; complexId?: number | null; complexName?: string; studentsCount?: number; committeesCount?: number }
export interface ReportTeacher { id: number; name: string; committees: string; attendance: { attended: number; late: number; absent: number; excused: number; expected: number; percentage: number | null }; achievement: { completed?: number; expected?: number; percentage: number | null } }
export interface ReportBranchPassing { expected: number; tested: number; percentage: number | null; studentsList: { id: number; name: string; committeeName: string; tested: boolean; juzNumbers: number[] }[] }
export interface ReportOverview {
  date?: string; period?: ReportPeriod;
  totals?: { studentsCount: number; familiesCount: number; supervisorsCount: number; studentPoints: number; familyPoints: number; quranFaces?: Record<string, number> };
  grades?: { weeklyProgram?: ReportGradeComponent; weeklySession?: ReportGradeComponent; trackSession?: ReportGradeComponent; reading?: ReportReading; narration?: { grade: number; students: number; studentsList: { id: number; name: string; committeeName: string; grade: number; times: number }[] }; facesRead?: Record<string, ReportValue>; compensations?: ReportDetailRow[] };
  attendance?: { students: ReportAttendanceTotals; supervisors: ReportAttendanceTotals };
  points?: { transactionsCount: number; activeStudents: number; increasePoints: number; deductionPoints: number; netPoints: number };
  families?: { familiesWithStudents: number; emptyFamilies: number; averageStudentsPerFamily: number };
  committeeIndicators?: ReportIndicatorCircle[];
  planPerformance?: { students: ReportPerformanceStudent[]; series: ReportPerformancePoint[] };
  branchPassing?: ReportBranchPassing; studentLevels?: ReportStudentLevel[];
  bestStudents?: ReportRankingRow[]; bestCommittees?: ReportRankingRow[]; bestComplexes?: ReportRankingRow[]; teachers?: ReportTeacher[];
  quranLeaders?: Record<string, ReportDetailRow[]>;
}
export interface ReportArchiveSummary { id: number; title: string; periodFrom: string; periodTo: string; createdAt: string }
export interface ReportArchive extends ReportArchiveSummary { period: ReportPeriod; overviewReport: ReportOverview | null; progressReport: ReportTable; snapshot: string }
export interface TeacherPointsRow { id: number; studentId: number; studentName: string; committeeName: string; type: 'increase' | 'deduction'; points: number; reason: string; transactionDate: string; teacherName: string }
export interface ReportStudentBalance { id: number; name: string; points: number; committeeId: number | null; committeeName: string }
export interface ReportGradingSessionRow extends ReportGradeStudent { recordedWeeks: number; segments: ReportSegments; attended: number; absent: number; late: number; excused: number }
export interface ReportGradingSessions { period: ReportPeriod; rows: ReportGradingSessionRow[]; compensations: ReportDetailRow[] }
export interface ReportManagementData {
  query: ReportManagementQuery; queryKey: string; actor: { role: NativeSession['role']; id: number; name: string };
  grants: ReportGrants; settings: ReportSettings; committees: ReportCircle[]; complexes: ReportComplex[];
  archives: ReportArchiveSummary[]; archive: ReportArchive | null; overview: ReportOverview | null;
  teacherPoints: { rows: TeacherPointsRow[] } | null; detail: ReportTable | null; reconciledArchiveDeletion: number | null;
}

export function canReadStandardReports(session: NativeSession | null): boolean {
  return !!session && (session.role === 'supervisor' || hasManagementGrant(session, 'reports'));
}
export function reportGrants(session: NativeSession, settings: ReportSettings): ReportGrants {
  const standard = canReadStandardReports(session) && (session.role === 'supervisor' || settings.reportsSectionEnabled);
  return { canViewStandardReports: standard, canViewTeacherPoints: standard && settings.teacherManualPointsEnabled,
    canManageArchives: standard && ['manager', 'admin'].includes(session.role), teacherScoped: session.role === 'supervisor',
    weeklySession: standard, trackSession: standard };
}
export function reportPercent(part: number, total: number): number { return total > 0 ? Math.round(part / total * 100) : 0; }
export const formatReportNumber = (value: number | null | undefined): string => formatStatisticsNumber(value);
const facesFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', { useGrouping: false, maximumFractionDigits: 2 });
export const formatReportFaces = (value: number | null | undefined): string => facesFormatter.format(Number(value || 0));
export function reportPeriodRange(period: ReportPeriodKey, custom: { from?: string; to?: string } = {}, today = getSaudiCalendarDate()): { from: string; to: string } {
  const normalized = { from: custom.from === undefined ? undefined : attendanceAsciiDigits(custom.from).trim(),
    to: custom.to === undefined ? undefined : attendanceAsciiDigits(custom.to).trim() };
  if (!Object.hasOwn(REPORT_PERIOD_LABELS, period) || !parseDateOnly(today)
    || (normalized.from && !parseDateOnly(normalized.from)) || (normalized.to && !parseDateOnly(normalized.to))) throw new NativeApiError('validation');
  return reportRange(period, normalized, today);
}

export const reportDetailKinds: readonly ReportDetailKind[] = ['students', 'supervisors', 'progress', 'recitations', 'saved', 'studentPoints', 'weekly', 'track'];
export function normalizeReportQuery(query: ReportManagementQuery): ReportManagementQuery {
  if (!query || typeof query.from !== 'string' || typeof query.to !== 'string') throw new NativeApiError('validation');
  const from = attendanceAsciiDigits(query.from).trim(), to = attendanceAsciiDigits(query.to).trim();
  const selected = (value: ReportScopeId): ReportScopeId => {
    if (value === 'all') return value;
    if (!Number.isSafeInteger(value) || value <= 0) throw new NativeApiError('validation');
    return value;
  };
  if (!parseDateOnly(from) || !parseDateOnly(to) || from > to
    || (query.archiveId !== undefined && (!Number.isSafeInteger(query.archiveId) || query.archiveId <= 0))
    || (query.reportType !== undefined && query.reportType !== 'overview' && !reportDetailKinds.includes(query.reportType))) throw new NativeApiError('validation');
  const archiveId = query.archiveId;
  return { from, to, committeeId: archiveId ? 'all' : selected(query.committeeId), complexId: archiveId ? 'all' : selected(query.complexId),
    ...(archiveId ? { archiveId } : {}), reportType: query.reportType ?? 'overview' };
}
export function reportQueryKey(query: ReportManagementQuery, context = ''): string { return JSON.stringify([context, normalizeReportQuery(query)]); }
export function freezeReportData<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freezeReportData); Object.freeze(value); }
  return value;
}
export function reportObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new NativeApiError('invalid-response');
  return value as Record<string, unknown>;
}
export function reportNumber(value: unknown): number {
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value))) || !Number.isFinite(Number(value))) throw new NativeApiError('invalid-response');
  return Number(value);
}
export function reportId(value: unknown, nullable: true): number | null;
export function reportId(value: unknown, nullable?: false): number;
export function reportId(value: unknown, nullable = false): number | null {
  if (nullable && value == null) return null;
  const result = reportNumber(value); if (!Number.isSafeInteger(result) || result <= 0) throw new NativeApiError('invalid-response'); return result;
}
function text(value: unknown): string { if (typeof value !== 'string') throw new NativeApiError('invalid-response'); return value; }
const optionalText = (value: unknown): string => value == null ? '' : text(value);
function list<T>(value: unknown, decode: (value: unknown) => T): T[] { if (!Array.isArray(value)) throw new NativeApiError('invalid-response'); return value.map(decode); }
function date(value: unknown): string { const result = text(value); if (!parseDateOnly(result)) throw new NativeApiError('invalid-response'); return result; }
function numericKeys(value: unknown): Record<string, number> { return Object.fromEntries(Object.entries(reportObject(value)).map(([key, item]) => [key, reportNumber(item)])); }
function nullableNumber(value: unknown): number | null { return value === null ? null : reportNumber(value); }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new NativeApiError('invalid-response'); return value; }
function optionalNumbers<T extends string>(row: Record<string, unknown>, keys: readonly T[]): Partial<Record<T, number>> {
  const result: Partial<Record<T, number>> = {}; for (const key of keys) if (row[key] !== undefined) result[key] = reportNumber(row[key]); return result;
}
function checkedValue(value: unknown, depth = 0): ReportValue {
  if (depth > 20) throw new NativeApiError('invalid-response');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return reportNumber(value);
  if (Array.isArray(value)) return value.map(item => checkedValue(item, depth + 1));
  return Object.fromEntries(Object.entries(reportObject(value)).map(([key, item]) => [key, checkedValue(item, depth + 1)]));
}
export function decodeReportPeriod(value: unknown): ReportPeriod {
  const row = reportObject(value); const allTime = row.mode === 'allTime';
  const from = allTime && row.from === '' ? '' : date(row.from), to = date(row.to); if (from && from > to) throw new NativeApiError('invalid-response');
  return { from, to, ...optionalNumbers(row, ['totalDays', 'attendanceDaysCount']),
    ...(row.committeeName !== undefined ? { committeeName: text(row.committeeName) } : {}),
    ...(row.committeeId !== undefined ? { committeeId: row.committeeId === 'all' ? 'all' : reportId(row.committeeId) } : {}),
    ...(row.studentId !== undefined ? { studentId: row.studentId === 'all' ? 'all' : reportId(row.studentId) } : {}),
    ...(row.mode !== undefined ? { mode: text(row.mode) } : {}), ...(row.quranReferenceMode !== undefined ? { quranReferenceMode: text(row.quranReferenceMode) } : {}),
    ...(row.sessionDates !== undefined ? { sessionDates: list(row.sessionDates, date) } : {}) };
}
export function decodeReportTable(value: unknown, expected?: { from: string; to: string }): ReportTable {
  const row = Array.isArray(value) ? { rows: value } : reportObject(value);
  const result = Object.fromEntries(Object.entries(row).map(([key, item]) => [key, checkedValue(item)]));
  const rows = list(row.rows, item => {
    const fields = reportObject(checkedValue(item));
    for (const key of ['name', 'studentName', 'committeeName', 'teacherName']) if (fields[key] !== undefined) fields[key] = optionalText(fields[key]);
    if (fields.id !== undefined && fields.id !== null) fields.id = typeof fields.id === 'string' && !/^\d+$/.test(fields.id) ? text(fields.id) : reportId(fields.id);
    if (fields.studentId !== undefined && fields.studentId !== null) fields.studentId = reportId(fields.studentId);
    if (fields.recordDate != null) {
      const raw = text(fields.recordDate);
      if (parseDateOnly(raw)) fields.recordDate = raw;
      else {
        const utc = new Date(raw);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw) || !Number.isFinite(utc.getTime()) || utc.toISOString() !== raw) throw new NativeApiError('invalid-response');
        fields.recordDate = getSaudiCalendarDate(utc);
      }
    }
    return fields as ReportDetailRow;
  });
  const period = row.period !== undefined ? decodeReportPeriod(row.period) : undefined;
  if (expected && period && ((period.from && period.from !== expected.from) || period.to !== expected.to)) throw new NativeApiError('invalid-response');
  return { ...result, rows, ...(period ? { period } : {}) };
}
export function decodeReportSettings(value: unknown): ReportSettings {
  const row = reportObject(value); return { reportsSectionEnabled: boolean(row.reportsSectionEnabled), teacherManualPointsEnabled: boolean(row.teacherManualPointsEnabled) };
}
export function decodeReportCircles(value: unknown): ReportCircle[] {
  return list(value, item => { const row = reportObject(item); return { id: reportId(row.id), name: text(row.name), complexId: reportId(row.complexId, true) }; });
}
export function decodeReportComplexes(value: unknown): ReportComplex[] {
  return list(value, item => { const row = reportObject(item); return { id: reportId(row.id), name: text(row.name) }; });
}
function decodeSegments(value: unknown): ReportSegments {
  const row = reportObject(value); return { tested: reportNumber(row.tested), total: reportNumber(row.total), compensated: reportNumber(row.compensated), mistakes: reportNumber(row.mistakes),
    warnings: reportNumber(row.warnings), hesitations: reportNumber(row.hesitations), grade: reportNumber(row.grade), max: reportNumber(row.max) };
}
function decodeGradeStudent(value: unknown): ReportGradeStudent {
  const row = reportObject(value); return { id: reportId(row.id), name: text(row.name), committeeName: text(row.committeeName), grade: reportNumber(row.grade), max: reportNumber(row.max), percentage: reportNumber(row.percentage),
    ...optionalNumbers(row, ['attendanceDays', 'expectedWeeks', 'attended', 'absent', 'late', 'excused']), ...(row.segments ? { segments: decodeSegments(row.segments) } : {}) };
}
function decodeGradeComponent(value: unknown): ReportGradeComponent {
  const row = reportObject(value); return { ...optionalNumbers(row, ['grade', 'max', 'percentage', 'students', 'recorded', 'attended', 'absent', 'late', 'excused', 'expectedAttendance']),
    ...(row.committees !== undefined ? { committees: list(row.committees, item => { const c = reportObject(item); return { id: reportId(c.id, true), name: text(c.name), grade: reportNumber(c.grade), max: reportNumber(c.max), percentage: reportNumber(c.percentage) }; }) } : {}),
    ...(row.studentsList !== undefined ? { studentsList: list(row.studentsList, decodeGradeStudent) } : {}), ...(row.segments ? { segments: decodeSegments(row.segments) } : {}) };
}
function decodeRatio(value: unknown): ReportRatio {
  const row = reportObject(value); return { done: reportNumber(row.done), total: reportNumber(row.total), ...(row.percentage !== undefined ? { percentage: nullableNumber(row.percentage) } : {}) };
}
function decodeIndicators(value: unknown): ReportIndicatorCircle[] {
  const metrics = (value: unknown) => Object.fromEntries(Object.entries(reportObject(value)).map(([key, item]) => [key, decodeRatio(item)]));
  return list(value, item => { const row = reportObject(item); return { id: reportId(row.id), name: text(row.name), studentsCount: reportNumber(row.studentsCount), overallPercentage: reportNumber(row.overallPercentage), metrics: metrics(row.metrics),
    students: list(row.students, s => { const pupil = reportObject(s); return { id: reportId(pupil.id), name: text(pupil.name), overallPercentage: reportNumber(pupil.overallPercentage), metrics: metrics(pupil.metrics) }; }) }; });
}
function decodePerformancePoint(value: unknown): ReportPerformancePoint {
  const row = reportObject(value); return { date: date(row.date), done: reportNumber(row.done), expected: reportNumber(row.expected), percentage: nullableNumber(row.percentage),
    ...optionalNumbers(row, ['shortageFaces', 'aheadFaces']), components: Object.fromEntries(Object.entries(reportObject(row.components)).map(([key, item]) => { const c = reportObject(item); return [key, { done: reportNumber(c.done), expected: reportNumber(c.expected) }]; })) };
}
function decodeRanking(value: unknown): ReportRankingRow {
  const row = reportObject(value); return { id: reportId(row.id), name: text(row.name), ...optionalNumbers(row, ['grade', 'max', 'average', 'studentsCount', 'committeesCount']),
    ...(row.percentage !== undefined ? { percentage: nullableNumber(row.percentage) } : {}), ...(row.committeeId !== undefined ? { committeeId: reportId(row.committeeId, true) } : {}),
    ...(row.complexId !== undefined ? { complexId: reportId(row.complexId, true) } : {}), ...(row.committeeName !== undefined ? { committeeName: text(row.committeeName) } : {}), ...(row.complexName != null ? { complexName: text(row.complexName) } : {}) };
}
function decodeTeacher(value: unknown): ReportTeacher {
  const row = reportObject(value), a = reportObject(row.attendance), c = reportObject(row.achievement);
  return { id: reportId(row.id), name: text(row.name), committees: text(row.committees), attendance: { attended: reportNumber(a.attended), late: reportNumber(a.late), absent: reportNumber(a.absent), excused: reportNumber(a.excused), expected: reportNumber(a.expected), percentage: nullableNumber(a.percentage) },
    achievement: { ...optionalNumbers(c, ['completed', 'expected']), percentage: nullableNumber(c.percentage) } };
}
export function decodeReportOverview(value: unknown, expected?: { from: string; to: string }): ReportOverview {
  const row = reportObject(value), result: ReportOverview = {};
  if (row.date !== undefined) result.date = date(row.date);
  if (row.period !== undefined) { result.period = decodeReportPeriod(row.period); if (expected && (result.period.from !== expected.from || result.period.to !== expected.to)) throw new NativeApiError('invalid-response'); }
  if (expected && !result.period) throw new NativeApiError('invalid-response');
  if (row.totals !== undefined) { const t = reportObject(row.totals); result.totals = { studentsCount: reportNumber(t.studentsCount), familiesCount: reportNumber(t.familiesCount), supervisorsCount: reportNumber(t.supervisorsCount), studentPoints: reportNumber(t.studentPoints), familyPoints: reportNumber(t.familyPoints), ...(t.quranFaces ? { quranFaces: numericKeys(t.quranFaces) } : {}) }; }
  if (row.grades !== undefined) {
    const g = reportObject(row.grades); const grades: NonNullable<ReportOverview['grades']> = {};
    for (const key of ['weeklyProgram', 'weeklySession', 'trackSession'] as const) if (g[key] !== undefined) grades[key] = decodeGradeComponent(g[key]);
    if (g.reading !== undefined) { const r = reportObject(g.reading); grades.reading = { expectedDays: reportNumber(r.expectedDays), expectedByStudent: numericKeys(r.expectedByStudent), days: reportNumber(r.days), hizbs: reportNumber(r.hizbs), byStudent: Object.fromEntries(Object.entries(reportObject(r.byStudent)).map(([key, item]) => { const s = reportObject(item); return [key, { days: reportNumber(s.days), faces: reportNumber(s.faces), hizbs: reportNumber(s.hizbs) }]; })) }; }
    if (g.narration !== undefined) { const n = reportObject(g.narration); grades.narration = { grade: reportNumber(n.grade), students: reportNumber(n.students), studentsList: list(n.studentsList, item => { const s = reportObject(item); return { id: reportId(s.id), name: text(s.name), committeeName: text(s.committeeName), grade: reportNumber(s.grade), times: reportNumber(s.times) }; }) }; }
    if (g.facesRead !== undefined) grades.facesRead = reportObject(checkedValue(g.facesRead)) as Record<string, ReportValue>;
    if (g.compensations !== undefined) grades.compensations = decodeReportTable({ rows: g.compensations }).rows;
    result.grades = grades;
  }
  if (row.attendance !== undefined) { const a = reportObject(row.attendance); const decode = (value: unknown): ReportAttendanceTotals => { const v = reportObject(value); return { present: reportNumber(v.present), late: reportNumber(v.late), excused: reportNumber(v.excused), absent: reportNumber(v.absent), total: reportNumber(v.total), ...optionalNumbers(v, ['percentage', 'notRecorded']) }; }; result.attendance = { students: decode(a.students), supervisors: decode(a.supervisors) }; }
  if (row.points !== undefined) { const p = reportObject(row.points); result.points = { transactionsCount: reportNumber(p.transactionsCount), activeStudents: reportNumber(p.activeStudents), increasePoints: reportNumber(p.increasePoints), deductionPoints: reportNumber(p.deductionPoints), netPoints: reportNumber(p.netPoints) }; }
  if (row.families !== undefined) { const f = reportObject(row.families); result.families = { familiesWithStudents: reportNumber(f.familiesWithStudents), emptyFamilies: reportNumber(f.emptyFamilies), averageStudentsPerFamily: reportNumber(f.averageStudentsPerFamily) }; }
  if (row.committeeIndicators !== undefined) result.committeeIndicators = decodeIndicators(row.committeeIndicators);
  if (row.planPerformance !== undefined) { const p = reportObject(row.planPerformance); result.planPerformance = { series: list(p.series, decodePerformancePoint), students: list(p.students, item => { const s = reportObject(item); return { studentId: reportId(s.studentId), ...(s.name !== undefined ? { name: text(s.name) } : {}), ...(s.committeeName !== undefined ? { committeeName: text(s.committeeName) } : {}), series: list(s.series, decodePerformancePoint) }; }) }; }
  if (row.studentLevels !== undefined) result.studentLevels = list(row.studentLevels, item => { const s = reportObject(item), l = reportObject(s.level); return { id: reportId(s.id), name: text(s.name), committeeName: text(s.committeeName), since: date(s.since), days: reportNumber(s.days), level: { key: text(l.key), name: text(l.name), progressPercent: reportNumber(l.progressPercent), finished: boolean(l.finished) } }; });
  if (row.branchPassing !== undefined) { const b = reportObject(row.branchPassing); result.branchPassing = { expected: reportNumber(b.expected), tested: reportNumber(b.tested), percentage: nullableNumber(b.percentage), studentsList: list(b.studentsList, item => { const s = reportObject(item); return { id: reportId(s.id), name: text(s.name), committeeName: text(s.committeeName), tested: boolean(s.tested), juzNumbers: list(s.juzNumbers, value => { const n = reportId(value); if (n > 30) throw new NativeApiError('invalid-response'); return n; }) }; }) }; }
  for (const key of ['bestStudents', 'bestCommittees', 'bestComplexes'] as const) if (row[key] !== undefined) result[key] = list(row[key], decodeRanking);
  if (row.teachers !== undefined) result.teachers = list(row.teachers, decodeTeacher);
  if (row.quranLeaders !== undefined) result.quranLeaders = Object.fromEntries(Object.entries(reportObject(row.quranLeaders)).map(([key, value]) => [key, decodeReportTable({ rows: value }).rows]));
  return result;
}
function stable(value: ReportValue): ReportValue {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key]!) ]));
  return value;
}
export function reportSnapshot(value: unknown): string { return JSON.stringify(stable(checkedValue(value))); }
export function decodeReportArchiveSummary(value: unknown): ReportArchiveSummary {
  const row = reportObject(value); const periodFrom = date(row.periodFrom), periodTo = date(row.periodTo), createdAt = text(row.createdAt);
  if (periodFrom > periodTo || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(createdAt) || !parseDateOnly(createdAt.slice(0, 10))
    || Number(createdAt.slice(11, 13)) > 23 || Number(createdAt.slice(14, 16)) > 59 || (createdAt.length > 16 && Number(createdAt.slice(17, 19)) > 59)) throw new NativeApiError('invalid-response');
  return { id: reportId(row.id), title: text(row.title), periodFrom, periodTo, createdAt };
}
export const decodeReportArchives = (value: unknown): ReportArchiveSummary[] => list(value, decodeReportArchiveSummary);
export function decodeReportArchive(value: unknown, expectedId: number): ReportArchive {
  const row = reportObject(value), base = decodeReportArchiveSummary(value), period = decodeReportPeriod(row.period);
  if (base.id !== expectedId || period.from !== base.periodFrom || period.to !== base.periodTo) throw new NativeApiError('invalid-response');
  const overviewReport = row.overviewReport === null ? null : decodeReportOverview(row.overviewReport);
  if (overviewReport?.period && (overviewReport.period.from !== period.from || overviewReport.period.to !== period.to)) throw new NativeApiError('invalid-response');
  return { ...base, period, overviewReport, progressReport: decodeReportTable(row.progressReport, period), snapshot: reportSnapshot(value) };
}
export function decodeTeacherPoints(value: unknown, expected: { from: string; to: string }): { rows: TeacherPointsRow[] } {
  const row = reportObject(value); if (row.period) { const p = decodeReportPeriod(row.period); if (p.from !== expected.from || p.to !== expected.to) throw new NativeApiError('invalid-response'); }
  return { rows: list(row.rows, item => { const r = reportObject(item), transactionDate = date(r.transactionDate); if (!['increase', 'deduction'].includes(String(r.type)) || transactionDate < expected.from || transactionDate > expected.to) throw new NativeApiError('invalid-response');
    return { id: reportId(r.id), studentId: reportId(r.studentId), studentName: text(r.studentName), committeeName: optionalText(r.committeeName), type: r.type as TeacherPointsRow['type'], points: reportNumber(r.points), reason: text(r.reason), transactionDate, teacherName: text(r.teacherName) }; }) };
}
export function decodeReportBalances(value: unknown): ReportStudentBalance[] {
  return list(value, item => { const row = reportObject(item); return { id: reportId(row.id), name: text(row.name), points: reportNumber(row.points), committeeId: reportId(row.committeeId, true), committeeName: optionalText(row.committeeName) }; });
}
export function decodeGradingSessions(value: unknown, expected: { from: string; to: string }): ReportGradingSessions {
  const row = reportObject(value), period = decodeReportPeriod(row.period); if (period.from !== expected.from || period.to !== expected.to) throw new NativeApiError('invalid-response');
  return { period, compensations: decodeReportTable({ rows: row.compensations }).rows, rows: list(row.rows, item => { const r = reportObject(item); return { ...decodeGradeStudent(r), recordedWeeks: reportNumber(r.recordedWeeks), segments: decodeSegments(r.segments), attended: reportNumber(r.attended), absent: reportNumber(r.absent), late: reportNumber(r.late), excused: reportNumber(r.excused) }; }) };
}
