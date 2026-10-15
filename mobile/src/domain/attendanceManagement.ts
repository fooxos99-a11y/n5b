import { getBusinessDate, shiftDateOnly } from '../../../shared/business-date.js';
import { isSeasonalHoliday } from '../../../shared/seasonal-holidays.js';
import { filterRosterByName } from '../../../src/lib/rosterSearch.js';
import { hasManagementGrant, type ManagedCircle } from './management';
import type { NativeSession } from './nativeSession';
import { attendanceLabels, validSupervisorDate, type StudentAttendanceStatus } from './supervisorDashboard';
import { NativeApiError, type NativeApiErrorCode } from '../services/nativeApi';

export type AttendanceTarget = 'students' | 'staff';
export type AttendanceStatus = StudentAttendanceStatus | 'unrecorded' | 'no_session';
export interface AttendanceQuery { target: AttendanceTarget; date: string; committeeId: string; from: string; to: string; staffId: string; period: boolean }
export interface AttendancePolicy {
  attendanceManualEnabled: boolean; attendanceAccountEnabled: boolean; recitationAttendanceSource: 'teacher' | 'supervisor';
  staffAttendanceSource: 'teacher' | 'supervisor'; staffAttendanceLateAfterAsrMinutes: number;
  recitationSessionDays: readonly number[]; seasonalHolidays: readonly { startDate: string; endDate: string }[];
}
export interface AttendanceRow {
  readonly key: string; readonly id: number; readonly name: string; readonly loginNumber: string; readonly committeeName: string;
  readonly jobTitle: string; readonly role: 'student' | 'supervisor' | 'admin' | 'reciter'; readonly joined: string | null;
  readonly status: AttendanceStatus; readonly recordDate: string; readonly checkInTime: string | null;
  readonly checkInMethod: string | null; readonly distance: number | null;
}
export interface AttendanceData { readonly query: AttendanceQuery; readonly effectiveDate: string; readonly policy: AttendancePolicy;
  readonly rows: readonly AttendanceRow[]; readonly circles: readonly ManagedCircle[] }
export interface AttendancePolicyDraft { staffAttendanceSource: 'teacher' | 'supervisor'; recitationAttendanceSource: 'teacher' | 'supervisor'; lateMinutes: string }
export interface AttendancePolicySource { readonly settings: Readonly<Record<string, unknown>>; readonly policy: AttendancePolicy }
export interface AttendanceBatchResult { saved: string[]; skipped: string[]; failed: { key: string; code: NativeApiErrorCode; message: string }[]; pending: string[] }
export class AttendanceBatchError extends NativeApiError {
  constructor(cause: NativeApiError, readonly result: AttendanceBatchResult) { super(cause.code, cause.status, cause.retryAfterMs); }
}
export const initialAttendanceQuery = (): AttendanceQuery => ({ target: 'students', date: getBusinessDate(), committeeId: 'all',
  from: getBusinessDate(), to: getBusinessDate(), staffId: 'all', period: false });
export const attendanceStatusOptions = (Object.keys(attendanceLabels) as StudentAttendanceStatus[]).map(value => ({ value, label: attendanceLabels[value] }));
export function attendanceStatusLabel(value: AttendanceStatus): string {
  return value === 'no_session' ? 'لا توجد جلسة في هذا اليوم' : value === 'unrecorded' ? 'لم يُحضّر' : attendanceLabels[value];
}
export function attendanceAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.includes(digit)
    ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}
export function attendanceDate(value: string): string {
  const date = attendanceAsciiDigits(value).trim(); if (!validSupervisorDate(date)) throw new NativeApiError('validation'); return date;
}
export function studentAttendanceSessionDate(value: string, days: readonly number[]): string {
  const date = attendanceDate(value);
  if (!days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new NativeApiError('validation');
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = shiftDateOnly(date, -offset);
    if (days.includes(new Date(candidate + 'T00:00:00Z').getUTCDay())) return candidate;
  }
  throw new NativeApiError('validation');
}
export function normalizeAttendanceQuery(input: AttendanceQuery): AttendanceQuery {
  if (!['students', 'staff'].includes(input.target) || typeof input.period !== 'boolean') throw new NativeApiError('validation');
  for (const id of [input.committeeId, input.staffId]) if (id !== 'all' && (!/^[1-9]\d*$/.test(id)
    || !Number.isSafeInteger(Number(id)))) throw new NativeApiError('validation');
  const date = attendanceDate(input.date); const from = attendanceDate(input.from); const to = attendanceDate(input.to);
  if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 + 1 > 366) throw new NativeApiError('validation');
  return { ...input, date, from, to };
}
export function requireAttendanceAccess(actor: NativeSession | null, target: AttendanceTarget) {
  if (!hasManagementGrant(actor, 'manualAttendance') || !hasManagementGrant(actor, 'reports')) throw new NativeApiError('forbidden');
  if (target === 'staff' && actor?.role === 'supervisor') throw new NativeApiError('forbidden');
}
export function canChangeAttendance(actor: NativeSession | null, data: AttendanceData, row: AttendanceRow, today = getBusinessDate()): boolean {
  if (!hasManagementGrant(actor, 'manualAttendance') || !hasManagementGrant(actor, 'reports') || !data.rows.includes(row)
    || row.status === 'no_session' || row.recordDate > today || (row.joined && row.recordDate < row.joined)
    || !data.policy.recitationSessionDays.includes(new Date(row.recordDate + 'T00:00:00Z').getUTCDay())
    || isSeasonalHoliday(row.recordDate, [...data.policy.seasonalHolidays])) return false;
  if (data.query.target === 'staff') return ['manager', 'admin'].includes(actor?.role ?? '') && data.policy.staffAttendanceSource === 'supervisor';
  return data.policy.attendanceManualEnabled;
}
export function filterAttendanceRows(rows: readonly AttendanceRow[], search: string, status: string): AttendanceRow[] {
  const named = new Set(filterRosterByName([...rows], search).map((row: AttendanceRow) => row.key)); const term = search.trim().toLowerCase();
  return rows.filter(row => (status === 'all' || row.status === status) && (!term || named.has(row.key)
    || `${row.loginNumber} ${row.committeeName} ${row.jobTitle}`.toLowerCase().includes(term)));
}
export function attendancePolicyDraft(policy: AttendancePolicy): AttendancePolicyDraft {
  return { staffAttendanceSource: policy.staffAttendanceSource, recitationAttendanceSource: policy.recitationAttendanceSource,
    lateMinutes: String(policy.staffAttendanceLateAfterAsrMinutes) };
}
export function attendancePolicyKey(policy: AttendancePolicy): string { return JSON.stringify(policy); }
export function normalizeAttendancePolicyDraft(draft: AttendancePolicyDraft, previous: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const minutes = attendanceAsciiDigits(draft.lateMinutes).trim();
  if (!/^\d+$/.test(minutes) || Number(minutes) > 1440 || !['teacher', 'supervisor'].includes(draft.staffAttendanceSource)
    || !['teacher', 'supervisor'].includes(draft.recitationAttendanceSource)) throw new NativeApiError('validation');
  return { ...previous, staffAttendanceSource: draft.staffAttendanceSource, recitationAttendanceSource: draft.recitationAttendanceSource,
    staffAttendanceLateAfterAsrMinutes: Number(minutes), attendanceManualEnabled: draft.recitationAttendanceSource !== 'teacher',
    automaticExecutionMessageEnabled: draft.recitationAttendanceSource === 'teacher' ? false : previous.automaticExecutionMessageEnabled };
}
