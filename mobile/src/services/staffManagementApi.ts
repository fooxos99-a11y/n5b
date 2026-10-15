import { positiveId, type ManagedCircle } from '../domain/management';
import { DASHBOARD_PERMISSION_KEYS } from '../../../shared/dashboard-permissions.js';
import type { NativeSessionController } from '../domain/nativeSession';
import { normalizeStaffDraft, requireStaffManagementScope, staffPermissions, type ManagedStaff, type StaffDraft, type StaffManagementMode } from '../domain/staffManagement';
import { decodeManagedCircle } from './managementApi';
import { NativeApiError } from './nativeApi';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NativeApiError('invalid-response');
  return value as Record<string, unknown>;
}
function text(value: unknown, optional = false): string {
  if (optional && (value === null || value === undefined)) return '';
  if (typeof value !== 'string') throw new NativeApiError('invalid-response');
  return value;
}
function responseId(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) throw new NativeApiError('invalid-response');
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new NativeApiError('invalid-response');
  return id;
}
export function decodeManagedStaff(value: unknown, mode: StaffManagementMode): ManagedStaff {
  const row = record(value);
  if (mode === 'supervisors' ? row.role !== 'supervisor' : !['admin', 'manager'].includes(String(row.role))) throw new NativeApiError('invalid-response');
  if (!Array.isArray(row.permissions) || row.permissions.some(key => typeof key !== 'string')) throw new NativeApiError('invalid-response');
  const committeeIds = mode === 'supervisors' ? row.committeeIds : [];
  if (!Array.isArray(committeeIds)) throw new NativeApiError('invalid-response');
  return { id: responseId(row.id), name: text(row.name), loginNumber: text(row.loginNumber), nationalId: text(row.nationalId, true),
    phone: text(row.phone, true), jobTitle: text(row.jobTitle, true), role: row.role as ManagedStaff['role'],
    committeeIds: [...new Set(committeeIds.map(responseId))], permissions: staffPermissions(mode, row.permissions as string[]) };
}
function rows<T>(value: unknown, decode: (row: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new NativeApiError('invalid-response');
  return value.map(decode);
}
function ok(value: unknown): void { if (record(value).ok !== true) throw new NativeApiError('invalid-response'); }
export function createStaffManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(); const actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const scope = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  function requireScope(mode: StaffManagementMode, permissions: readonly string[] = [], target?: ManagedStaff) {
    const current = controller.getSnapshot(); const identity = current.session;
    if (current.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (scope !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled');
    requireStaffManagementScope(identity, mode, permissions, target);
  }
  async function request<T>(mode: StaffManagementMode, path: string, options: Parameters<NativeSessionController['request']>[1],
    decode: (value: unknown) => T, permissions: readonly string[] = [], target?: ManagedStaff): Promise<T> {
    requireScope(mode, permissions, target);
    const result = await controller.request(path, options, decode);
    requireScope(mode, permissions, target);
    return result;
  }
  return {
    canManage(mode: StaffManagementMode, target?: ManagedStaff): boolean {
      try { requireScope(mode, [], target); return true; } catch { return false; }
    },
    assignablePermissions(mode: StaffManagementMode): readonly string[] {
      requireScope(mode);
      const current = controller.getSnapshot().session!;
      return staffPermissions(mode, current.role === 'manager' ? DASHBOARD_PERMISSION_KEYS : current.dashboardPermissions);
    },
    async loadStaff(mode: StaffManagementMode, signal?: AbortSignal): Promise<{ staff: ManagedStaff[]; circles: ManagedCircle[] }> {
      requireScope(mode);
      const [staff, circles] = await Promise.all([
        request(mode, `/${mode}`, { signal }, value => rows(value, row => decodeManagedStaff(row, mode))),
        mode === 'supervisors' ? request(mode, '/committees', { signal }, value => rows(value, decodeManagedCircle)) : Promise.resolve([]),
      ]);
      requireScope(mode);
      return { staff, circles };
    },
    async saveStaff(mode: StaffManagementMode, draft: StaffDraft, circles: readonly ManagedCircle[], selected?: ManagedStaff): Promise<void> {
      requireScope(mode, draft.permissions, selected);
      const payload = normalizeStaffDraft(mode, draft, circles, !!selected);
      await request(mode, selected ? `/${mode}/${positiveId(selected.id)}` : `/${mode}`, {
        method: selected ? 'PUT' : 'POST', body: payload,
      }, value => { if (selected) ok(value); else decodeManagedStaff(value, mode); }, payload.permissions, selected);
      // A self edit must refresh access immediately, including sign-out when credentials were revoked.
      if (selected && selected.id === actor.id && selected.role === actor.role) {
        try { await controller.restore(); }
        catch (cause) { if (!(cause instanceof NativeApiError && cause.code === 'unauthorized')) throw cause; }
      }
    },
    async deleteStaff(mode: StaffManagementMode, selected: ManagedStaff): Promise<void> {
      requireScope(mode, [], selected);
      await request(mode, `/${mode}/${positiveId(selected.id)}`, { method: 'DELETE' }, ok, [], selected);
      if (selected.id === actor.id && selected.role === actor.role) await controller.logout();
    },
  };
}
export type StaffManagementApi = ReturnType<typeof createStaffManagementApi>;
