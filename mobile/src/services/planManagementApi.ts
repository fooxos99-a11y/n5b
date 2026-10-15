import { dashboardObject, studentDate } from '../domain/studentDashboard';
import { hasManagementGrant, positiveId } from '../domain/management';
import type { NativeSessionController } from '../domain/nativeSession';
import { decodeManagedPlanStudents, decodePlanAyahs, decodePlanChapters, decodePlanPause, decodePlanSettings,
  normalizePlanDraft, planSnapshotKey, type ManagedPlanStudent, type PlanDraft, type PlanManagementData, type PlanPause } from '../domain/planManagement';
import { NativeApiError } from './nativeApi';

export function createPlanManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const scope = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  function assertContext(global = false) {
    const current = controller.getSnapshot(); const identity = current.session;
    if (current.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (scope !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled');
    if (!hasManagementGrant(identity, 'studentPlans') || (global && !['manager', 'admin'].includes(identity.role))) throw new NativeApiError('forbidden');
  }
  async function request<T>(path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T, global = false) {
    assertContext(global); const value = await controller.request(path, options, decode); assertContext(global); return value;
  }
  const list = (signal?: AbortSignal) => request('/student-plans?committeeId=all', { signal }, decodeManagedPlanStudents);
  async function assertLatest(row: ManagedPlanStudent) {
    const latest = (await list()).find(item => item.studentId === positiveId(row.studentId));
    if (!latest || planSnapshotKey(latest) !== planSnapshotKey(row)) throw new NativeApiError('conflict', 409);
  }
  function ok(value: unknown): void { if (dashboardObject(value).ok !== true) throw new NativeApiError('invalid-response'); }
  function saved(value: unknown): number {
    ok(value); const id = dashboardObject(value).id;
    if ((typeof id !== 'number' && typeof id !== 'string') || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new NativeApiError('invalid-response');
    return Number(id);
  }
  return {
    async load(signal?: AbortSignal): Promise<PlanManagementData> {
      assertContext();
      const [rows, chapters, pause, settings, lastStartDate] = await Promise.all([
        list(signal), request('/quran/chapters', { signal }, decodePlanChapters), request('/student-plans/pause', { signal }, decodePlanPause),
        request('/public-settings', { signal }, decodePlanSettings), request('/student-plans/preferences', { signal }, value => {
          const date = dashboardObject(value).lastStartDate; return date === '' ? '' : studentDate(date);
        }),
      ]);
      return { rows, chapters, pause, settings, lastStartDate };
    },
    async ayahs(surah: number, signal?: AbortSignal) {
      assertContext(); if (!Number.isSafeInteger(surah) || surah < 1 || surah > 114) throw new NativeApiError('validation');
      return request(`/quran/ayahs?surah=${surah}`, { signal }, decodePlanAyahs);
    },
    async savePlan(row: ManagedPlanStudent, draft: PlanDraft, data: PlanManagementData): Promise<number> {
      assertContext(); const payload = normalizePlanDraft(draft, row, data); await assertLatest(row);
      return request(`/student-plans/${positiveId(row.studentId)}`, { method: 'PUT', body: payload }, saved);
    },
    async closePlan(row: ManagedPlanStudent): Promise<number> {
      assertContext(); if (!row.plan?.queuedRanges.length) throw new NativeApiError('validation');
      await assertLatest(row);
      return request(`/student-plans/${positiveId(row.studentId)}/close`, { method: 'POST', body: { planId: positiveId(row.plan.id) } }, saved);
    },
    async deletePlan(row: ManagedPlanStudent): Promise<void> {
      assertContext(); if (!row.plan) throw new NativeApiError('validation'); await assertLatest(row);
      await request(`/student-plans/${positiveId(row.studentId)}`, { method: 'DELETE' }, ok);
    },
    async deletePrior(row: ManagedPlanStudent, fromPage: number, toPage: number): Promise<void> {
      assertContext();
      if (!Number.isInteger(fromPage) || !Number.isInteger(toPage) || fromPage < 1 || toPage > 604 || fromPage > toPage
        || !row.priorMemorization.some(range => fromPage >= range.startPage && toPage <= range.endPage)) throw new NativeApiError('validation');
      await assertLatest(row);
      await request(`/student-plans/${positiveId(row.studentId)}/prior-memorization`, { method: 'DELETE', body: { fromPage, toPage } }, ok);
    },
    async setPause(state: PlanPause, studentId?: number): Promise<PlanPause> {
      assertContext(!studentId);
      if (!state.canManage || typeof state.paused !== 'boolean' || !Number.isSafeInteger(state.revision) || state.revision < 0) throw new NativeApiError('validation');
      return request(`/student-plans/pause${studentId ? `/${positiveId(studentId)}` : ''}`,
        { method: 'PUT', body: { paused: !state.paused, revision: state.revision } }, decodePlanPause, !studentId);
    },
  };
}
export type PlanManagementApi = ReturnType<typeof createPlanManagementApi>;
