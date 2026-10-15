import { normalizeOptionalIdentity, normalizeOptionalPhone } from '../../../shared/account-contact.js';
import { normalizeDashboardGrants } from '../../../shared/dashboard-permissions.js';
import { filterRosterByName } from '../../../src/lib/rosterSearch.js';
import type { NativeSession } from './nativeSession';
import { NativeApiError } from '../services/nativeApi';

export interface ManagedStudent {
  id: number; name: string; loginNumber: string; nationalId: string; guardianPhone: string; phone: string;
  committeeId: number | null; committeeName: string; complexId: number | null; points: number;
}
export interface ManagedCircle { id: number; name: string; complexId: number | null; complexName: string; points: number; studentsCount: number }
export interface ManagedComplex { id: number; name: string; committeesCount: number }
export interface CircleStudent { id: number; name: string; guardianPhone: string }
export interface StudentDraft {
  name: string; loginNumber: string; password: string; nationalId: string; guardianPhone: string; phone: string;
  complexId: string; committeeId: string; gradeAdjustmentType: 'increase' | 'deduction';
  gradeAdjustmentAmount: string; gradeAdjustmentReason: string;
}
export type StudentPayload = Omit<StudentDraft, 'complexId' | 'committeeId'> & { complexId: number; committeeId: number };
export const emptyStudentDraft = (): StudentDraft => ({ name: '', loginNumber: '', password: '', nationalId: '', guardianPhone: '',
  phone: '', complexId: '', committeeId: '', gradeAdjustmentType: 'increase', gradeAdjustmentAmount: '', gradeAdjustmentReason: '' });
export function studentDraft(student: ManagedStudent): StudentDraft {
  return { ...emptyStudentDraft(), name: student.name, loginNumber: student.loginNumber, nationalId: student.nationalId,
    guardianPhone: student.guardianPhone, phone: student.phone, complexId: String(student.complexId ?? ''), committeeId: String(student.committeeId ?? '') };
}
export function hasManagementGrant(session: NativeSession | null, grant: string): boolean {
  return !!session && (session.role === 'manager' || (['supervisor', 'admin'].includes(session.role)
    && normalizeDashboardGrants([...session.dashboardPermissions]).includes(grant)));
}
export function positiveId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new NativeApiError('validation');
  return id;
}
const asciiDigits = (value: string) => value.replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.includes(digit)
  ? '٠١٢٣٤٥٦٧٨٩'.indexOf(digit) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
export function normalizeStudentDraft(draft: StudentDraft, circles: readonly ManagedCircle[], currentPoints?: number): StudentPayload {
  const name = draft.name.replace(/\s+/g, ' ').trim();
  const loginNumber = asciiDigits(draft.loginNumber).trim();
  if (name.length < 2 || name.length > 180 || !/^\d{1,80}$/.test(loginNumber)
    || !draft.password.length || draft.password.length > 256) throw new NativeApiError('validation');
  const complexId = positiveId(draft.complexId); const committeeId = positiveId(draft.committeeId);
  if (!circles.some(circle => circle.id === committeeId && circle.complexId === complexId)) throw new NativeApiError('validation');
  let nationalId: string; let guardianPhone: string; let phone: string;
  try { nationalId = normalizeOptionalIdentity(draft.nationalId); guardianPhone = normalizeOptionalPhone(draft.guardianPhone); phone = normalizeOptionalPhone(draft.phone); }
  catch (error) { throw new Error(error instanceof Error ? error.message : 'تحقق من أرقام التواصل.', { cause: error }); }
  const amount = asciiDigits(draft.gradeAdjustmentAmount).replaceAll('٫', '.').trim(); const reason = draft.gradeAdjustmentReason.trim();
  if (amount) {
    const number = Number(amount); const rounded = Math.round(number * 100) / 100;
    if (!Number.isFinite(number) || number < 0 || number > 2147483647
      || (rounded > 0 && (!reason || reason.length > 500))
      || !['increase', 'deduction'].includes(draft.gradeAdjustmentType)
      || (currentPoints !== undefined && draft.gradeAdjustmentType === 'deduction' && rounded > currentPoints)
      || (currentPoints !== undefined && draft.gradeAdjustmentType === 'increase' && currentPoints + rounded > 2147483647)) throw new NativeApiError('validation');
  }
  return { ...draft, name, loginNumber, nationalId, guardianPhone, phone, complexId, committeeId,
    gradeAdjustmentAmount: amount, gradeAdjustmentReason: reason };
}
export function filterManagedStudents(rows: readonly ManagedStudent[], search: string, circle: string, complex: string): ManagedStudent[] {
  return filterRosterByName([...rows], search).filter((row: ManagedStudent) => (circle === 'all' || (circle === 'none' ? row.committeeId === null : row.committeeId === Number(circle)))
    && (complex === 'all' || row.complexId === Number(complex)));
}
