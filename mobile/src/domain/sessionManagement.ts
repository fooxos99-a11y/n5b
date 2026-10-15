import { getBusinessDate } from '../../../shared/business-date.js';
import { normalizeGradingPolicy, trackSegmentDefinitions } from '../../../shared/grading-policy.js';
import { evaluateTrackSession, evaluateWeeklySession } from '../../../shared/grading-engine.js';
import { canTestSession, sessionAttendanceStatus } from '../../../shared/session-attendance.js';
import { weekStartOf } from '../../../src/components/dashboard/grades/gradesFormat.js';
import { trackAttendancePayload } from '../../../src/services/sessionAttendanceBatch.js';
import { formatQuranRangeText } from '../../../src/lib/quranRangeText.js';
import { filterRosterByName } from '../../../src/lib/rosterSearch.js';
import { NativeApiError } from '../services/nativeApi';
import { dashboardObject, decodeStudentRange, studentDate, type StudentRange } from './studentDashboard';
import { attendanceLabels, type StudentAttendanceStatus } from './supervisorDashboard';
import type { ManagedCircle } from './management';

export type SessionComponent = 'weekly' | 'track';
export type SessionPolicy = ReturnType<typeof normalizeGradingPolicy>;
export interface SessionSegment {
  index: number; source: 'link' | 'review'; range: StudentRange | null; recorded: boolean;
  mistakes: number; warnings: number; hesitations: number; grade: number; max: number;
}
export interface SessionDetail {
  attended: boolean; attendanceStatus: StudentAttendanceStatus | null; attendanceRecorded: boolean;
  grade: number; max: number; operationType: string; segments: SessionSegment[];
}
export interface SessionStudent {
  id: number; name: string; committeeId: number | null; committeeName: string;
  detail: SessionDetail | null; grade: { grade: number; max: number; recorded: boolean };
}
export interface SessionWeek {
  component: SessionComponent; weekStart: string; weekEnd: string; currentWeekStart: string;
  periodStart: string; periodEnd: string; hasPreviousWeek: boolean; seasonalHoliday: boolean;
  policy: SessionPolicy; maximumTotal: number; students: SessionStudent[];
}
export interface SessionManagementData { week: SessionWeek; circles: ManagedCircle[] }
export interface SessionAttempt { studentId: number; weekStart: string; attemptToken: string; segments: SessionSegment[] }
export interface SessionSegmentDraft { mistakes: string; warnings: string; hesitations: string; confirmed: boolean }
export const sessionTitles: Record<SessionComponent, string> = { weekly: 'الجلسة الأسبوعية', track: 'جلسة المسار' };
export const sessionGrants: Record<SessionComponent, string> = { weekly: 'weeklySession', track: 'trackSession' };
export const sessionAttendanceOptions = Object.entries(attendanceLabels).map(([value, label]) => ({ value, label }));
export const validSessionComponent = (value: unknown): value is SessionComponent => value === 'weekly' || value === 'track';
const invalid = (): never => { throw new NativeApiError('invalid-response'); };
function numeric(value: unknown, min = 0, max = 1e9, integer = false): number {
  const result = typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) ? Number(value) : NaN;
  return Number.isFinite(result) && result >= min && result <= max && (!integer || Number.isSafeInteger(result)) ? result : invalid();
}
function text(value: unknown, fallback?: string): string { return value == null && fallback !== undefined ? fallback : typeof value === 'string' ? value : invalid(); }
function flag(value: unknown, fallback?: boolean): boolean { return value == null && fallback !== undefined ? fallback : typeof value === 'boolean' ? value : invalid(); }
function rows<T>(value: unknown, decode: (value: unknown, index: number) => T, max = 20000): T[] { return Array.isArray(value) && value.length <= max ? value.map(decode) : invalid(); }
export function decodeSessionPolicy(value: unknown): SessionPolicy {
  const source = dashboardObject(value); dashboardObject(source.weeklyProgram);
  const weekly = dashboardObject(source.weeklySession), track = dashboardObject(source.trackSession);
  numeric(weekly.attendance, 0, 1000); numeric(track.attendance, 0, 1000);
  numeric(track.segmentCount, 0, 20, true); numeric(track.segmentMax, 0, 1000);
  for (const key of ['mistakeDeduction', 'warningDeduction', 'hesitationDeduction']) numeric(track[key], 0, 1000);
  if (track.segments !== undefined) rows(track.segments, value => {
    const segment = dashboardObject(value); if (segment.source !== 'link' && segment.source !== 'review') return invalid();
    numeric(segment.max, 0, 1000); return segment;
  }, 20);
  return normalizeGradingPolicy(source);
}
export function decodeSessionSegment(value: unknown, index: number): SessionSegment {
  const row = dashboardObject(value); const source = row.source ?? (index % 2 ? 'review' : 'link');
  if (source !== 'link' && source !== 'review') return invalid();
  const range = row.range == null ? null : decodeStudentRange(row.range);
  if (range && (!range.fromSurah || !range.fromAyah || !range.toSurah || !range.toAyah)) return invalid();
  return { index: index + 1, source, range, recorded: flag(row.recorded, true), mistakes: numeric(row.mistakes ?? 0, 0, 1000, true),
    warnings: numeric(row.warnings ?? 0, 0, 1000, true), hesitations: numeric(row.hesitations ?? 0, 0, 1000, true),
    grade: numeric(row.grade ?? 0), max: numeric(row.max) };
}
function decodeDetail(value: unknown, component: SessionComponent): SessionDetail | null {
  if (value == null) return null;
  const row = dashboardObject(value); const attended = flag(row.attended);
  if (row.attendanceStatus != null && !Object.hasOwn(attendanceLabels, String(row.attendanceStatus))) return invalid();
  const attendanceRecorded = flag(row.attendanceRecorded, true);
  return { attended, attendanceStatus: sessionAttendanceStatus({ ...row, attended, attendanceRecorded }) as StudentAttendanceStatus | null,
    attendanceRecorded, grade: numeric(row.grade), max: numeric(row.max), operationType: text(row.operationType, ''),
    segments: component === 'track' ? rows(row.segments ?? [], (value, index?: number) => decodeSessionSegment(value, index ?? 0), 20) : [] };
}
export function decodeSessionWeek(value: unknown, component: SessionComponent): SessionWeek {
  if (!validSessionComponent(component)) throw new NativeApiError('validation');
  const row = dashboardObject(value); const policy = decodeSessionPolicy(row.policy), maxima = dashboardObject(row.maxima);
  const students = rows(row.students, value => {
    const student = dashboardObject(value), grade = dashboardObject(student.grade);
    const score = dashboardObject(grade[`${component}Session`]);
    return { id: numeric(student.id, 1, Number.MAX_SAFE_INTEGER, true), name: text(student.name),
      committeeId: student.committeeId == null ? null : numeric(student.committeeId, 1, Number.MAX_SAFE_INTEGER, true), committeeName: text(student.committeeName, ''),
      detail: decodeDetail(grade[`${component}Detail`], component), grade: { grade: numeric(score.grade), max: numeric(score.max), recorded: flag(score.recorded) } };
  });
  if (new Set(students.map(student => student.id)).size !== students.length) return invalid();
  const weekStart = studentDate(row.weekStart), weekEnd = studentDate(row.weekEnd), currentWeekStart = studentDate(row.currentWeekStart);
  const periodStart = studentDate(row.periodStart ?? weekStart), periodEnd = studentDate(row.periodEnd ?? weekEnd);
  if (weekStart !== weekStartOf(weekStart) || weekEnd < weekStart || periodEnd < periodStart) return invalid();
  return { component, weekStart, weekEnd, currentWeekStart, periodStart, periodEnd, policy, students,
    hasPreviousWeek: flag(row.hasPreviousWeek), seasonalHoliday: flag(row.seasonalHoliday), maximumTotal: numeric(maxima.total) };
}
export function sessionEditable(week: SessionWeek, today = getBusinessDate()): boolean {
  return week.weekStart <= today && week.periodStart <= today && !week.seasonalHoliday && week.maximumTotal !== 0;
}
export function sessionTested(student: SessionStudent): boolean {
  return !!student.detail && canTestSession(student.detail) && student.detail.segments.some(segment => segment.recorded);
}
export function sessionAttendanceDeletesEvaluation(student: SessionStudent, status: StudentAttendanceStatus): boolean {
  return sessionTested(student) && !canTestSession({ attendanceStatus: status });
}
export function sessionStudent(week: SessionWeek, studentId: number): SessionStudent {
  const student = week.students.find(student => student.id === studentId);
  if (!student) throw new NativeApiError('validation'); return student;
}
function wireRange(range: StudentRange | null) {
  return range ? { fromSurah: range.fromSurah, fromAyah: range.fromAyah, toSurah: range.toSurah, toAyah: range.toAyah } : null;
}
export function sessionAttendancePayload(week: SessionWeek, student: SessionStudent, status: StudentAttendanceStatus) {
  if (!Object.hasOwn(attendanceLabels, status) || !sessionEditable(week)) throw new NativeApiError('validation');
  const detail = student.detail ? { ...student.detail, segments: student.detail.segments.map(segment => ({ ...segment, range: wireRange(segment.range) })) } : null;
  return { studentId: student.id, weekStart: week.weekStart, component: week.component,
    ...(week.component === 'track' ? trackAttendancePayload(detail, status, week.policy.trackSession.segmentCount) : { attendanceStatus: status }) };
}
export function decodeSessionAttempt(value: unknown, week: SessionWeek, student: SessionStudent): SessionAttempt {
  const row = dashboardObject(value); const token = text(row.attemptToken);
  if (!token || token.length > 16000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return invalid();
  const definitions = trackSegmentDefinitions(week.policy);
  const segments = rows(row.segments, (value, index?: number) => decodeSessionSegment({ ...dashboardObject(value), recorded: false }, index ?? 0), 20);
  if (!segments.length || segments.length !== definitions.length || segments.some((segment, index) => !segment.range || segment.source !== definitions[index]?.source || segment.max !== definitions[index]?.max)) return invalid();
  return { studentId: student.id, weekStart: week.weekStart, attemptToken: token, segments };
}
export function emptySessionSegmentDraft(): SessionSegmentDraft { return { mistakes: '0', warnings: '0', hesitations: '0', confirmed: false }; }
export function sessionErrorCount(value: string): number {
  const digits = value.replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.includes(digit) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).trim();
  if (!/^\d+$/.test(digits) || !Number.isSafeInteger(Number(digits)) || Number(digits) > 1000) throw new NativeApiError('validation');
  return Number(digits);
}
export function sessionTestSegments(attempt: SessionAttempt, drafts: readonly SessionSegmentDraft[], complete: boolean) {
  if (drafts.length !== attempt.segments.length || (complete && drafts.some(draft => !draft.confirmed))) throw new NativeApiError('validation');
  return attempt.segments.map((segment, index) => {
    const draft = drafts[index]!; return { range: wireRange(segment.range), mistakes: sessionErrorCount(draft.mistakes),
      warnings: sessionErrorCount(draft.warnings), hesitations: sessionErrorCount(draft.hesitations), recorded: draft.confirmed };
  });
}
export function sessionTestPreview(week: SessionWeek, student: SessionStudent, attempt: SessionAttempt, drafts: readonly SessionSegmentDraft[]) {
  return evaluateTrackSession(week.policy, { attendanceStatus: sessionAttendanceStatus(student.detail ?? {}), segments: sessionTestSegments(attempt, drafts, false) });
}
export function sessionAttendancePreview(week: SessionWeek, student: SessionStudent, status: StudentAttendanceStatus) {
  const payload = sessionAttendancePayload(week, student, status);
  return week.component === 'track' ? evaluateTrackSession(week.policy, payload) : evaluateWeeklySession(week.policy, payload);
}
export function sessionSnapshot(week: SessionWeek, student: SessionStudent): string {
  const policy = { ...week.policy, weeklySession: { ...week.policy.weeklySession, sessionDay: week.policy.weeklySession.sessionDay ?? 0 },
    trackSession: { ...week.policy.trackSession, sessionDay: week.policy.trackSession.sessionDay ?? 0 } };
  return JSON.stringify([week.component, week.weekStart, week.periodStart, policy, week.seasonalHoliday, week.maximumTotal, student.id, student.detail]);
}
export function sessionRangeLabel(range: StudentRange | null): string {
  if (!range) return 'لم يُحدد مقطع بعد.';
  return formatQuranRangeText({ startSurah: range.fromSurah, startAyah: range.fromAyah, endSurah: range.toSurah,
    endAyah: range.toAyah, startSurahName: range.fromSurahName, endSurahName: range.toSurahName });
}
export function filterSessionStudents(students: readonly SessionStudent[], search: string): SessionStudent[] { return filterRosterByName([...students], search); }
