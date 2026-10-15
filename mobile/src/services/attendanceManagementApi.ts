import { getBusinessDate, getSaudiCalendarDate } from '../../../shared/business-date.js';
import { hasManagementGrant, positiveId } from '../domain/management';
import type { NativeSessionController } from '../domain/nativeSession';
import { AttendanceBatchError, attendanceDate, attendancePolicyKey, canChangeAttendance, normalizeAttendancePolicyDraft,
  normalizeAttendanceQuery, requireAttendanceAccess, studentAttendanceSessionDate, type AttendanceBatchResult, type AttendanceData,
  type AttendancePolicy, type AttendancePolicyDraft, type AttendancePolicySource, type AttendanceQuery, type AttendanceRow, type AttendanceTarget } from '../domain/attendanceManagement';
import { validSupervisorDate, type StudentAttendanceStatus } from '../domain/supervisorDashboard';
import { decodeManagedCircle } from './managementApi';
import { NativeApiError } from './nativeApi';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeApiError('invalid-response'); return value as Record<string, unknown>;
}
function text(value: unknown, optional = false): string {
  if (optional && value == null) return ''; if (typeof value !== 'string') throw new NativeApiError('invalid-response'); return value;
}
function numeric(value: unknown, minimum = 0): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !String(value).trim() || !Number.isFinite(Number(value))
    || Number(value) < minimum) throw new NativeApiError('invalid-response'); return Number(value);
}
function flag(value: unknown): boolean { if (typeof value !== 'boolean') throw new NativeApiError('invalid-response'); return value; }
function date(value: unknown, optional = false): string | null {
  if (optional && value == null) return null; if (!validSupervisorDate(value)) throw new NativeApiError('invalid-response'); return value;
}
function studentRecordDate(value: unknown, effectiveDate: string): string {
  if (value == null) return effectiveDate;
  if (validSupervisorDate(value)) {
    if (value !== effectiveDate) throw new NativeApiError('invalid-response'); return value;
  }
  // The one-day student report returns a raw MySQL DATE serialized as an ISO instant.
  // Match its civil date in Riyadh; the 03:00 execution-day boundary does not apply to SQL DATE.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new NativeApiError('invalid-response');
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value || getSaudiCalendarDate(instant) !== effectiveDate) throw new NativeApiError('invalid-response');
  return effectiveDate;
}
function list<T>(value: unknown, decode: (row: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new NativeApiError('invalid-response'); return value.map(decode);
}
export function decodeAttendancePolicy(value: unknown): AttendancePolicy {
  const row = record(value);
  if (!['teacher', 'supervisor'].includes(String(row.staffAttendanceSource)) || !['teacher', 'supervisor'].includes(String(row.recitationAttendanceSource))) throw new NativeApiError('invalid-response');
  const days = list(row.recitationSessionDays, item => { const day = numeric(item); if (!Number.isInteger(day) || day > 6) throw new NativeApiError('invalid-response'); return day; });
  const lateMinutes = numeric(row.staffAttendanceLateAfterAsrMinutes);
  if (!days.length || !Number.isInteger(lateMinutes) || lateMinutes > 1440) throw new NativeApiError('invalid-response');
  const holidays = list(row.seasonalHolidays ?? [], item => { const entry = record(item); const startDate = date(entry.startDate)!; const endDate = date(entry.endDate)!;
    if (startDate > endDate) throw new NativeApiError('invalid-response'); return Object.freeze({ startDate, endDate }); });
  return Object.freeze({ attendanceManualEnabled: flag(row.attendanceManualEnabled), attendanceAccountEnabled: row.attendanceAccountEnabled === undefined ? false : flag(row.attendanceAccountEnabled),
    recitationAttendanceSource: row.recitationAttendanceSource as AttendancePolicy['recitationAttendanceSource'],
    staffAttendanceSource: row.staffAttendanceSource as AttendancePolicy['staffAttendanceSource'],
    staffAttendanceLateAfterAsrMinutes: lateMinutes, recitationSessionDays: Object.freeze([...new Set(days)]), seasonalHolidays: Object.freeze(holidays) });
}
export function decodeAttendanceRows(value: unknown, target: AttendanceTarget, effectiveDate: string): readonly AttendanceRow[] {
  const rows = list(value, value => {
    const item = record(value); const id = numeric(item.id, 1); if (!Number.isSafeInteger(id)) throw new NativeApiError('invalid-response');
    const status = item.status == null || item.status === '' ? 'unrecorded' : item.status;
    if (!['present', 'late', 'excused', 'absent', 'no_session', 'unrecorded'].includes(String(status))) throw new NativeApiError('invalid-response');
    const role = target === 'students' ? 'student' : item.role;
    if (!['student', 'supervisor', 'admin', 'reciter'].includes(String(role))) throw new NativeApiError('invalid-response');
    const recordDate = target === 'students' ? studentRecordDate(item.recordDate, effectiveDate) : date(item.recordDate, true) ?? effectiveDate;
    const checkInTime = item.checkInTime == null ? null : text(item.checkInTime);
    if (checkInTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(checkInTime)) throw new NativeApiError('invalid-response');
    return Object.freeze({ key: `${id}:${recordDate}`, id, name: text(item.name), loginNumber: text(item.loginNumber, true), committeeName: text(item.committeeName, true),
      jobTitle: text(item.jobTitle, true), role: role as AttendanceRow['role'], joined: date(item.joined, true), status: status as AttendanceRow['status'], recordDate,
      checkInTime, checkInMethod: item.checkInMethod == null ? null : text(item.checkInMethod), distance: item.distance == null ? null : numeric(item.distance) });
  });
  if (new Set(rows.map(row => row.key)).size !== rows.length) throw new NativeApiError('invalid-response'); return Object.freeze(rows);
}
export function createAttendanceManagementApi(controller: NativeSessionController, clock = getBusinessDate) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const scope = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  let loaded: AttendanceData | null = null; let loadEpoch = 0; let running = false; let uncertain = false;
  const savedKeys = new Set<string>();
  function current() {
    const snapshot = controller.getSnapshot(); const identity = snapshot.session;
    if (snapshot.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (scope !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled'); return identity;
  }
  function requireRead(target: AttendanceTarget) { requireAttendanceAccess(current(), target); }
  function requireSettings() { if (!hasManagementGrant(current(), 'settings')) throw new NativeApiError('forbidden'); }
  async function request<T>(guard: () => void, path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T): Promise<T> {
    guard(); const value = await controller.request(path, options, decode); guard(); return value;
  }
  function requireData(data: AttendanceData) {
    requireRead(data.query.target); if (loaded !== data || uncertain) throw new NativeApiError('conflict');
  }
  return {
    canViewStaff(): boolean { try { const identity = current(); return ['manager', 'admin'].includes(identity.role) && hasManagementGrant(identity, 'reports'); } catch { return false; } },
    canEditPolicy(): boolean { try { return hasManagementGrant(current(), 'settings'); } catch { return false; } },
    canSet(data: AttendanceData, row: AttendanceRow): boolean { try { return loaded === data && !uncertain && canChangeAttendance(current(), data, row, clock()); } catch { return false; } },
    async load(input: AttendanceQuery, signal?: AbortSignal): Promise<AttendanceData> {
      if (running) throw new NativeApiError('conflict');
      const query = Object.freeze(normalizeAttendanceQuery(input)); requireRead(query.target); const epoch = ++loadEpoch; loaded = null;
      const policy = await request(() => requireRead(query.target), '/public-settings', { signal }, decodeAttendancePolicy);
      const effectiveDate = query.target === 'students' ? studentAttendanceSessionDate(query.date, policy.recitationSessionDays) : query.date;
      const params = new URLSearchParams(query.target === 'students' ? { date: effectiveDate, committeeId: query.committeeId }
        : query.period ? { from: query.from, to: query.to, staffId: query.staffId } : { date: effectiveDate, staffId: query.staffId });
      const [rows, circles] = await Promise.all([
        request(() => requireRead(query.target), `/reports/${query.target === 'students' ? 'students' : 'supervisors'}?${params}`, { signal }, value => decodeAttendanceRows(value, query.target, effectiveDate)),
        query.target === 'students' && current().role !== 'supervisor' ? request(() => requireRead(query.target), '/committees', { signal }, value => list(value, decodeManagedCircle)) : Promise.resolve([]),
      ]);
      requireRead(query.target); if (epoch !== loadEpoch) throw new NativeApiError('cancelled');
      loaded = Object.freeze({ query, effectiveDate, policy, rows, circles: Object.freeze(circles) }); uncertain = false; savedKeys.clear(); return loaded;
    },
    async saveAttendance(data: AttendanceData, selected: readonly AttendanceRow[], status: StudentAttendanceStatus): Promise<AttendanceBatchResult> {
      requireData(data);
      if (running) throw new NativeApiError('conflict');
      if (!['present', 'late', 'excused', 'absent'].includes(status) || !selected.length || new Set(selected.map(row => row.key)).size !== selected.length
        || selected.some(row => !data.rows.includes(row) || !canChangeAttendance(current(), data, row, clock()))) throw new NativeApiError('validation');
      running = true; const result: AttendanceBatchResult = { saved: [], skipped: [], failed: [], pending: selected.map(row => row.key) };
      try {
        for (const row of selected) {
          requireData(data); const key = `${data.query.target}:${row.key}:${status}`;
          if (row.status === status || savedKeys.has(key)) { result.skipped.push(row.key); result.pending.shift(); continue; }
          result.pending.shift();
          try {
            await request(() => { requireData(data); }, `/${data.query.target === 'students' ? 'students' : 'supervisors'}/${positiveId(row.id)}/${status === 'absent' ? 'absence' : 'attendance'}`, {
              method: 'POST', body: { mode: 'manual', date: attendanceDate(row.recordDate), status },
            }, value => { const reply = record(value); if (reply.ok !== true || reply.date !== row.recordDate || reply.status !== status) throw new NativeApiError('invalid-response'); });
            savedKeys.add(key); result.saved.push(row.key);
          } catch (cause) {
            const error = cause instanceof NativeApiError ? cause : new NativeApiError('network');
            result.failed.push({ key: row.key, code: error.code, message: error.message });
            if (['network', 'timeout', 'server', 'invalid-response'].includes(error.code)) uncertain = true;
            if (uncertain || ['forbidden', 'unauthorized', 'cancelled'].includes(error.code)) throw new AttendanceBatchError(error, result);
          }
        }
        return result;
      } finally { running = false; }
    },
    async loadPolicy(signal?: AbortSignal): Promise<AttendancePolicySource> {
      return request(requireSettings, '/settings', { signal }, value => { const settings = record(value); return Object.freeze({ settings: Object.freeze(settings), policy: decodeAttendancePolicy(settings) }); });
    },
    async savePolicy(source: AttendancePolicySource, draft: AttendancePolicyDraft): Promise<void> {
      requireSettings(); if (running || uncertain) throw new NativeApiError('conflict');
      normalizeAttendancePolicyDraft(draft, source.settings); running = true;
      try {
        const fresh = await request(requireSettings, '/settings', {}, record);
        if (attendancePolicyKey(decodeAttendancePolicy(fresh)) !== attendancePolicyKey(source.policy)) throw new NativeApiError('conflict');
        const payload = normalizeAttendancePolicyDraft(draft, fresh);
        await request(requireSettings, '/settings', { method: 'PUT', body: payload }, value => {
          const policy = decodeAttendancePolicy(value);
          if (policy.staffAttendanceSource !== draft.staffAttendanceSource || policy.recitationAttendanceSource !== draft.recitationAttendanceSource
            || policy.staffAttendanceLateAfterAsrMinutes !== Number(payload.staffAttendanceLateAfterAsrMinutes)) throw new NativeApiError('invalid-response');
        });
        loaded = null;
      } catch (cause) { if (cause instanceof NativeApiError && ['network', 'timeout', 'server', 'invalid-response'].includes(cause.code)) uncertain = true; throw cause; }
      finally { running = false; }
    },
  };
}
export type AttendanceManagementApi = ReturnType<typeof createAttendanceManagementApi>;
