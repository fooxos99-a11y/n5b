import { normalizeOptionalIdentity, normalizeOptionalPhone } from '../../../shared/account-contact.js';
import { DASHBOARD_PERMISSION_KEYS, normalizeDashboardGrants, SUPERVISOR_BASE_PERMISSIONS } from '../../../shared/dashboard-permissions.js';
import { filterRosterByName } from '../../../src/lib/rosterSearch.js';
import { hasManagementGrant, positiveId, type ManagedCircle } from './management';
import type { NativeSession } from './nativeSession';
import { NativeApiError } from '../services/nativeApi';

export type StaffManagementMode = 'supervisors' | 'administrators';
export interface ManagedStaff {
  id: number; name: string; loginNumber: string; nationalId: string; phone: string; jobTitle: string;
  role: 'supervisor' | 'admin' | 'manager'; committeeIds: number[]; permissions: string[];
}
export interface StaffDraft {
  name: string; loginNumber: string; password: string; nationalId: string; phone: string; jobTitle: string;
  committeeIds: string[]; permissions: string[];
}
export interface StaffPayload {
  name: string; loginNumber: string; password?: string; nationalId: string; phone: string;
  jobTitle?: string; committeeIds?: number[]; permissions: string[];
}
const permissionLabels: Readonly<Record<string, string>> = {
  manualAttendance: 'التحضير', staffAttendance: 'تحضير الموظفين', registrationRequests: 'طلبات التسجيل', students: 'الطلاب',
  studentPlans: 'خطط الطلاب', narrationDay: 'يوم السرد', quranPassing: 'الاجتياز', calls: 'المكالمات', quranEvaluation: 'جلسات التسميع',
  weeklySession: 'الجلسة الأسبوعية', trackSession: 'جلسة المسار', families: 'المجمعات والحلقات', supervisors: 'مشرفو المسارات',
  administrators: 'الإداريون', notifications: 'الإشعارات', reports: 'الإحصائيات', whatsappSend: 'الإرسال عبر الواتس',
  settings: 'الإعدادات', store: 'المتجر',
};
export const staffPermissionOptions = DASHBOARD_PERMISSION_KEYS.filter(key => key !== 'grades')
  .map(key => ({ value: key, label: permissionLabels[key] ?? key }));
export function staffFixedPermissions(mode: StaffManagementMode): readonly string[] {
  return mode === 'supervisors' ? SUPERVISOR_BASE_PERMISSIONS : [];
}
export function emptyStaffDraft(): StaffDraft {
  return { name: '', loginNumber: '', password: '', nationalId: '', phone: '', jobTitle: 'إداري', committeeIds: [], permissions: [] };
}
export function staffDraft(staff: ManagedStaff): StaffDraft {
  return { ...emptyStaffDraft(), name: staff.name, loginNumber: staff.loginNumber, nationalId: staff.nationalId,
    phone: staff.phone, jobTitle: staff.jobTitle || 'إداري', committeeIds: staff.committeeIds.map(String), permissions: [...staff.permissions] };
}
export function staffPermissions(mode: StaffManagementMode, permissions: readonly string[]): string[] {
  return normalizeDashboardGrants([...permissions]).filter(key => mode !== 'administrators' || key !== 'quranEvaluation');
}
export function requireStaffManagementScope(actor: NativeSession | null, mode: StaffManagementMode,
  permissions: readonly string[] = [], target?: ManagedStaff): void {
  if (!hasManagementGrant(actor, mode)) throw new NativeApiError('forbidden');
  const expectedRole = mode === 'supervisors' ? 'supervisor' : 'admin';
  if (target && target.role !== expectedRole) throw new NativeApiError('conflict');
  if (actor?.role === 'manager') return;
  const allowed = new Set(normalizeDashboardGrants([...(actor?.dashboardPermissions ?? [])]));
  if (normalizeDashboardGrants([...permissions, ...(target?.permissions ?? [])]).some(key => !allowed.has(key))) throw new NativeApiError('forbidden');
}
export function normalizeStaffDraft(mode: StaffManagementMode, draft: StaffDraft, circles: readonly ManagedCircle[], editing = false): StaffPayload {
  const name = draft.name.replace(/\s+/g, ' ').trim();
  const loginNumber = draft.loginNumber.replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.includes(digit)
    ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).trim();
  if (name.length < 2 || name.length > 180 || !/^\d{3,80}$/.test(loginNumber)
    || (!editing && !draft.password.length) || draft.password.length > 256) throw new NativeApiError('validation');
  if (draft.permissions.some(key => !DASHBOARD_PERMISSION_KEYS.includes(key))) throw new NativeApiError('validation');
  let nationalId: string; let phone: string;
  try { nationalId = normalizeOptionalIdentity(draft.nationalId); phone = normalizeOptionalPhone(draft.phone); }
  catch (cause) { throw new Error(cause instanceof Error ? cause.message : 'تحقق من أرقام التواصل.', { cause }); }
  const payload: StaffPayload = { name, loginNumber, nationalId, phone, permissions: staffPermissions(mode, draft.permissions) };
  // Staff edits preserve an existing password when the field is empty. Password text is never trimmed.
  if (draft.password !== '') payload.password = draft.password;
  if (mode === 'administrators') {
    const jobTitle = draft.jobTitle.trim() || 'إداري';
    if (jobTitle.length > 120) throw new NativeApiError('validation');
    payload.jobTitle = jobTitle;
  } else {
    const committeeIds = [...new Set(draft.committeeIds.map(positiveId))];
    if (committeeIds.some(id => !circles.some(circle => circle.id === id))) throw new NativeApiError('validation');
    payload.committeeIds = committeeIds;
  }
  return payload;
}
export function filterManagedStaff(rows: readonly ManagedStaff[], search: string, circle = 'all'): ManagedStaff[] {
  const term = search.trim().toLowerCase();
  const names = new Set(filterRosterByName([...rows], search).map((row: ManagedStaff) => row.id));
  return rows.filter(row => (!term || names.has(row.id) || [row.loginNumber, row.phone, row.jobTitle].some(value => value.toLowerCase().includes(term)))
    && (circle === 'all' || (circle === 'none' ? row.committeeIds.length === 0 : row.committeeIds.includes(Number(circle)))));
}
