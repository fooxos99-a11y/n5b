import { getBusinessDate } from '../../../shared/business-date.js';
import { weekStartOf } from '../../../src/components/dashboard/grades/gradesFormat.js';
import type { NativeSession } from './nativeSession';
import { hasManagementGrant } from './management';
import { validSupervisorDate } from './supervisorDashboard';
import { NativeApiError } from '../services/nativeApi';

export type DayCompensationScope = 'program' | 'track';
export interface CompensationDay { readonly date: string; readonly dayNumber: number }
export interface CompensationRecord {
  readonly id: number; readonly studentId: number; readonly date: string; readonly scope: DayCompensationScope;
  readonly actorName: string; readonly recordedAt: string; readonly excuseReference: string;
  readonly cancelledAt: string | null; readonly cancelledByName: string; readonly cancellationReason: string;
}
export interface CompensationStudent { readonly id: number; readonly name: string; readonly days: readonly CompensationDay[]; readonly records: readonly CompensationRecord[] }
export interface CompensationOverview { readonly scope: DayCompensationScope; readonly weekStart: string; readonly weekEnd: string;
  readonly canManage: boolean; readonly policyKey: string; readonly students: readonly CompensationStudent[] }
export interface DayCompensationSnapshot { readonly scope: DayCompensationScope; readonly date: string; readonly weekStart: string;
  readonly canManage: boolean; readonly policyKey: string; readonly student: CompensationStudent }
export interface CompensationPolicyDraft { allowQuranCompensation: boolean; allowQuranExtra: boolean }
export interface CompensationPolicySource { readonly settings: Readonly<Record<string, unknown>>; readonly policy: Readonly<CompensationPolicyDraft> }
export interface CompensationWriteResult { readonly id: number; readonly studentId: number; readonly date: string;
  readonly scope: DayCompensationScope; readonly components: readonly { component: string; grade: number; max?: number }[] }
export const compensationReference = 'استئذان معتمد في النظام';
export const compensationScopeLabel = (scope: DayCompensationScope) => scope === 'track' ? 'جلسة المسار' : 'البرنامج الأسبوعي';
export function requireDayCompensationScope(actor: NativeSession | null, scope: DayCompensationScope): void {
  if (scope !== 'program' && scope !== 'track') throw new NativeApiError('validation');
  if (!(scope === 'track' ? hasManagementGrant(actor, 'trackSession')
    : hasManagementGrant(actor, 'quranEvaluation') || hasManagementGrant(actor, 'weeklySession'))) throw new NativeApiError('forbidden');
}
export function compensationDate(value: string): string {
  if (!validSupervisorDate(value)) throw new NativeApiError('validation'); return value;
}
export function cancellationReason(value: string): string {
  const reason = value.trim(); if (reason.length < 3 || reason.length > 500) throw new NativeApiError('validation'); return reason;
}
export function compensationPeriod(scope: DayCompensationScope, date: string): string {
  return scope === 'track' ? weekStartOf(compensationDate(date)) : compensationDate(date);
}
export function activeDayCompensation(snapshot: DayCompensationSnapshot, date = snapshot.date): CompensationRecord | undefined {
  const period = compensationPeriod(snapshot.scope, date);
  return snapshot.student.records.find(row => !row.cancelledAt && compensationPeriod(snapshot.scope, row.date) === period);
}
export function validateCompensationDay(snapshot: DayCompensationSnapshot, day: CompensationDay, today = getBusinessDate()): void {
  if (!snapshot.student.days.includes(day) || day.date !== snapshot.date || day.date > today || activeDayCompensation(snapshot, day.date)) throw new NativeApiError('validation');
}
export function compensationSnapshotKey(value: DayCompensationSnapshot): string {
  return JSON.stringify([value.scope, value.date, value.weekStart, value.policyKey, value.canManage, value.student]);
}
export function compensationPolicyKey(value: CompensationPolicyDraft): string {
  return JSON.stringify([value.allowQuranCompensation, value.allowQuranExtra]);
}
export function compensationPolicyPayload(draft: CompensationPolicyDraft, latest: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (typeof draft.allowQuranCompensation !== 'boolean' || typeof draft.allowQuranExtra !== 'boolean') throw new NativeApiError('validation');
  return { ...latest, allowQuranCompensation: draft.allowQuranCompensation, allowQuranExtra: draft.allowQuranExtra };
}
