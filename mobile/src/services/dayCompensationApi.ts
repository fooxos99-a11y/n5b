import { getBusinessDate, shiftDateOnly } from '../../../shared/business-date.js';
import { weekStartOf } from '../../../src/components/dashboard/grades/gradesFormat.js';
import { activeDayCompensation, cancellationReason, compensationDate, compensationPolicyKey, compensationPolicyPayload,
  compensationReference, compensationSnapshotKey, requireDayCompensationScope, validateCompensationDay,
  type CompensationDay, type CompensationOverview, type CompensationPolicyDraft, type CompensationPolicySource,
  type CompensationRecord, type CompensationStudent, type CompensationWriteResult, type DayCompensationScope, type DayCompensationSnapshot } from '../domain/dayCompensation';
import { hasManagementGrant, positiveId } from '../domain/management';
import type { NativeSessionController } from '../domain/nativeSession';
import { decodeSessionPolicy } from '../domain/sessionManagement';
import { validSupervisorDate } from '../domain/supervisorDashboard';
import { NativeApiError } from './nativeApi';

const invalid = (): never => { throw new NativeApiError('invalid-response'); };
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid(); }
function text(value: unknown, optional = false): string { return optional && value == null ? '' : typeof value === 'string' ? value : invalid(); }
function flag(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid(); }
function number(value: unknown, id = false): number {
  const numeric = (typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) ? Number(value) : NaN;
  return Number.isFinite(numeric) && numeric >= (id ? 1 : 0) && (!id || Number.isSafeInteger(numeric)) ? numeric : invalid();
}
function date(value: unknown): string { return validSupervisorDate(value) ? value : invalid(); }
function timestamp(value: unknown): string {
  const source = text(value); const local = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(source);
  const instant = new Date(local ? `${source}+03:00` : source);
  if (!Number.isFinite(instant.getTime()) || !validSupervisorDate(source.slice(0, 10))
    || (!local && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(source) || instant.toISOString() !== source))) return invalid();
  return source;
}
function list<T>(value: unknown, decode: (value: unknown) => T): readonly T[] { return Array.isArray(value) ? Object.freeze(value.map(decode)) : invalid(); }
export function decodeCompensationDays(value: unknown): readonly CompensationDay[] {
  const days = list(value, item => { const row = record(item); return Object.freeze({ date: date(row.date), dayNumber: number(row.dayNumber, true) }); });
  if (new Set(days.map(day => day.date)).size !== days.length) return invalid(); return days;
}
export function decodeCompensationRecord(value: unknown): CompensationRecord {
  const row = record(value); if (row.scope !== 'program' && row.scope !== 'track') return invalid();
  return Object.freeze({ id: number(row.id, true), studentId: number(row.studentId, true), date: date(row.date), scope: row.scope,
    actorName: text(row.actorName), recordedAt: timestamp(row.recordedAt), excuseReference: text(row.excuseReference),
    cancelledAt: row.cancelledAt == null ? null : timestamp(row.cancelledAt), cancelledByName: text(row.cancelledByName, true), cancellationReason: text(row.cancellationReason, true) });
}
export function decodeCompensationOverview(value: unknown, scope: DayCompensationScope): CompensationOverview {
  const row = record(value); const weekStart = date(row.weekStart), weekEnd = date(row.weekEnd); const policy = decodeSessionPolicy(row.policy);
  if (weekStart !== weekStartOf(weekStart) || weekEnd !== shiftDateOnly(weekStart, 6)) return invalid();
  const students = list<CompensationStudent>(row.students, value => {
    const student = record(value); const id = number(student.id, true); const eligible = record(student.compensationDays);
    const days = decodeCompensationDays(eligible[scope] ?? []);
    const records = list(student.compensations, decodeCompensationRecord).filter(item => item.scope === scope);
    if (records.some(item => item.studentId !== id || item.date < weekStart || item.date > weekEnd)
      || new Set(records.map(item => item.id)).size !== records.length) return invalid();
    return Object.freeze({ id, name: text(student.name), days, records: Object.freeze(records) });
  });
  if (new Set(students.map(student => student.id)).size !== students.length) return invalid();
  return Object.freeze({ scope, weekStart, weekEnd, canManage: flag(row.canManageCompensations), policyKey: JSON.stringify(policy), students });
}
export function decodeCompensationPolicy(value: unknown): CompensationPolicySource {
  const settings = record(value); return Object.freeze({ settings: Object.freeze(settings), policy: Object.freeze({
    allowQuranCompensation: flag(settings.allowQuranCompensation), allowQuranExtra: flag(settings.allowQuranExtra) }) });
}
function writeResult(value: unknown, source: DayCompensationSnapshot): CompensationWriteResult {
  const body = record(value), result = record(body.result);
  if (body.ok !== true || number(result.studentId, true) !== source.student.id || result.date !== source.date || result.scope !== source.scope) return invalid();
  const components = list(result.components, item => { const entry = record(item); const component = text(entry.component);
    if (!(source.scope === 'track' ? component === 'track' : ['memorization', 'link', 'review', 'reading'].includes(component))) return invalid();
    return Object.freeze({ component, grade: number(entry.grade), ...(entry.max === undefined ? {} : { max: number(entry.max) }) }); });
  if (!components.length || new Set(components.map(row => row.component)).size !== components.length) return invalid();
  return Object.freeze({ id: number(result.id, true), studentId: source.student.id, date: source.date, scope: source.scope, components });
}

export function createDayCompensationApi(controller: NativeSessionController, clock = getBusinessDate) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const identityKey = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  let loaded: DayCompensationSnapshot | null = null; let loadEpoch = 0; let running = false;
  let unknown: { kind: 'grant' | 'cancel'; scope: DayCompensationScope; studentId: number; date: string; recordId?: number } | { kind: 'policy' } | null = null;
  function current() {
    const snapshot = controller.getSnapshot(), identity = snapshot.session;
    if (snapshot.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (identityKey !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled'); return identity;
  }
  function requireScope(scope: DayCompensationScope) { requireDayCompensationScope(current(), scope); }
  function requireSettings() { if (!hasManagementGrant(current(), 'settings')) throw new NativeApiError('forbidden'); }
  async function request<T>(guard: () => void, path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T): Promise<T> {
    guard(); const response = await controller.request(path, options, decode); guard(); return response;
  }
  function week(scope: DayCompensationScope, selectedDate: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ component: scope === 'track' ? 'track' : 'weekly', weekStart: selectedDate });
    return request(() => requireScope(scope), `/grading/week?${query}`, { signal }, value => decodeCompensationOverview(value, scope));
  }
  function days(scope: DayCompensationScope, studentId: number, signal?: AbortSignal) {
    return request(() => requireScope(scope), `/grading/${scope}-compensation-days?studentId=${positiveId(studentId)}`, { signal }, value => decodeCompensationDays(record(value).days));
  }
  async function snapshot(scope: DayCompensationScope, studentId: number, selectedDate: string, signal?: AbortSignal): Promise<DayCompensationSnapshot> {
    const [overview, eligible] = await Promise.all([week(scope, selectedDate, signal), days(scope, studentId, signal)]);
    const student = overview.students.find(row => row.id === studentId);
    if (!student || overview.weekStart !== weekStartOf(selectedDate)) throw new NativeApiError('forbidden');
    return Object.freeze({ scope, date: selectedDate, weekStart: overview.weekStart, canManage: overview.canManage, policyKey: overview.policyKey,
      student: Object.freeze({ ...student, days: eligible }) });
  }
  function requireLoaded(source: DayCompensationSnapshot) {
    requireScope(source.scope); if (unknown || loaded !== source || running) throw new NativeApiError('conflict');
  }
  async function fresh(source: DayCompensationSnapshot) {
    const latest = await snapshot(source.scope, source.student.id, source.date);
    if (compensationSnapshotKey(latest) !== compensationSnapshotKey(source)) throw new NativeApiError('conflict');
  }
  function uncertain(cause: unknown): NativeApiError {
    return cause instanceof NativeApiError ? cause : new NativeApiError('network');
  }
  function isUnknown(error: NativeApiError) { return ['network', 'timeout', 'server', 'invalid-response'].includes(error.code); }
  return {
    canUse(scope: DayCompensationScope): boolean { try { requireScope(scope); return true; } catch { return false; } },
    canEditPolicy(): boolean { try { requireSettings(); return true; } catch { return false; } },
    async loadOverview(scope: DayCompensationScope, selectedDate = clock(), signal?: AbortSignal): Promise<CompensationOverview> {
      requireScope(scope); return week(scope, compensationDate(selectedDate), signal);
    },
    async load(scope: DayCompensationScope, studentId: number, selectedDate: string, signal?: AbortSignal): Promise<DayCompensationSnapshot> {
      requireScope(scope); positiveId(studentId); compensationDate(selectedDate);
      if (running || unknown && (unknown.kind === 'policy' || unknown.scope !== scope || unknown.studentId !== studentId || weekStartOf(unknown.date) !== weekStartOf(selectedDate))) throw new NativeApiError('conflict');
      const epoch = ++loadEpoch; loaded = null; const next = await snapshot(scope, studentId, selectedDate, signal);
      requireScope(scope); if (epoch !== loadEpoch) throw new NativeApiError('cancelled');
      if (unknown) {
        const target = unknown;
        if (target.kind === 'grant') {
          const recorded = next.student.records.find(row => row.date === target.date && !row.cancelledAt);
          if (!recorded && !next.student.days.some(day => day.date === target.date)) throw new NativeApiError('conflict');
        } else if (!next.student.records.some(row => row.id === target.recordId)) throw new NativeApiError('conflict');
        unknown = null;
      }
      loaded = next; return next;
    },
    async compensate(source: DayCompensationSnapshot, day: CompensationDay): Promise<CompensationWriteResult> {
      requireLoaded(source); validateCompensationDay(source, day, clock()); running = true;
      try {
        await fresh(source); let result: CompensationWriteResult;
        try { result = await request(() => requireScope(source.scope), `/grading/${source.scope}-compensation`, {
          method: 'POST', body: { studentId: source.student.id, date: day.date, excuseReference: compensationReference },
        }, value => writeResult(value, source)); }
        catch (cause) { const error = uncertain(cause); if (isUnknown(error)) unknown = { kind: 'grant', scope: source.scope, studentId: source.student.id, date: source.date }; throw error; }
        loaded = null; return result;
      } finally { running = false; }
    },
    async cancel(source: DayCompensationSnapshot, row: CompensationRecord, reason: string): Promise<void> {
      requireLoaded(source); requireSettings(); const normalized = cancellationReason(reason);
      if (!source.canManage || !source.student.records.includes(row) || row.cancelledAt || activeDayCompensation(source, row.date)?.id !== row.id) throw new NativeApiError('validation');
      running = true;
      try {
        await fresh(source); requireSettings();
        try { await request(() => { requireScope(source.scope); requireSettings(); }, `/grading/compensations/${row.id}/cancel`, { method: 'POST', body: { reason: normalized } }, value => {
          const body = record(value), result = record(body.result);
          if (body.ok !== true || number(result.studentId, true) !== source.student.id || result.date !== row.date || result.scope !== source.scope) return invalid();
        }); }
        catch (cause) { const error = uncertain(cause); if (isUnknown(error)) unknown = { kind: 'cancel', scope: source.scope, studentId: source.student.id, date: row.date, recordId: row.id }; throw error; }
        loaded = null;
      } finally { running = false; }
    },
    async loadPolicy(signal?: AbortSignal): Promise<CompensationPolicySource> {
      requireSettings(); if (running || unknown && unknown.kind !== 'policy') throw new NativeApiError('conflict');
      const source = await request(requireSettings, '/settings', { signal }, decodeCompensationPolicy); if (unknown?.kind === 'policy') unknown = null; return source;
    },
    async savePolicy(source: CompensationPolicySource, draft: CompensationPolicyDraft): Promise<void> {
      requireSettings(); if (running || unknown) throw new NativeApiError('conflict'); compensationPolicyPayload(draft, source.settings); running = true;
      try {
        const latest = await request(requireSettings, '/settings', {}, decodeCompensationPolicy);
        if (compensationPolicyKey(latest.policy) !== compensationPolicyKey(source.policy)) throw new NativeApiError('conflict');
        const payload = compensationPolicyPayload(draft, latest.settings);
        try { await request(requireSettings, '/settings', { method: 'PUT', body: payload }, value => {
          const next = decodeCompensationPolicy(value); if (compensationPolicyKey(next.policy) !== compensationPolicyKey(draft)) return invalid();
        }); }
        catch (cause) { const error = uncertain(cause); if (isUnknown(error)) unknown = { kind: 'policy' }; throw error; }
        loaded = null;
      } finally { running = false; }
    },
  };
}
export type DayCompensationApi = ReturnType<typeof createDayCompensationApi>;
