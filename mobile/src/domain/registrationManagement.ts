import { normalizeOptionalIdentity, normalizeOptionalPhone } from '../../../shared/account-contact.js';
import { normalizeDashboardGrants } from '../../../shared/dashboard-permissions.js';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';
import { formatJuzNumbers } from '../../../src/lib/juzRanges.js';
import { normalizeNumericInput } from '../../../src/lib/numericInput.js';
import type { NativeSession } from './nativeSession';

export type RegistrationTestResult = 'passed' | 'failed';
export type RegistrationDeliveryStatus = 'sent' | 'failed' | 'skipped' | null;
export type RegistrationMemorizationItem = { id: string; type: 'juz' | 'range'; label: string; juz: number | null };
export type ManagedRegistrationRequest = {
  id: number; name: string; guardianPhone: string; nationalId: string; age: number;
  complexId: number | null; complexName: string; committeeId: number | null; committeeName: string;
  memorization: { items: RegistrationMemorizationItem[]; juzs: number[] };
  testResults: Record<string, RegistrationTestResult>; preliminarySentAt: string | null; createdAt: string;
};
export type RegistrationManagementCommittee = { id: number; name: string; complexId: number | null; complexName: string };
export type RegistrationManagementData = { registrationEnabled: boolean; requests: ManagedRegistrationRequest[]; committees: RegistrationManagementCommittee[] };
export type RegistrationAcceptanceForm = {
  name: string; guardianPhone: string; nationalId: string; age: string; complexId: string; committeeId: string;
  loginNumber: string; password: string;
};
export type RegistrationAcceptancePayload = RegistrationAcceptanceForm & { testResults: Record<string, RegistrationTestResult> };
export type RegistrationActionResult = { ok: true; deliveryStatus: RegistrationDeliveryStatus };
export type RegistrationAcceptanceResult = RegistrationActionResult & {
  student: { id: number; name: string; loginNumber: string; guardianPhone: string; nationalId: string; age: number;
    complexId: number; complexName: string; committeeId: number; committeeName: string };
};
export type RegistrationAcceptanceValidation = { valid: true; payload: RegistrationAcceptancePayload }
  | { valid: false; field: keyof RegistrationAcceptanceForm | 'testResults'; message: string };
export type RegistrationRequestFilter = 'all' | 'preliminary' | 'pending-preliminary';
export const registrationRequestFilters = [
  { value: 'all', label: 'جميع الطلبات' },
  { value: 'preliminary', label: 'قبول مبدئي مسجل' },
  { value: 'pending-preliminary', label: 'دون قبول مبدئي' },
] as const;

export function canManageRegistration(session: NativeSession): boolean {
  return session.role === 'manager' || (['admin', 'supervisor'].includes(session.role)
    && normalizeDashboardGrants([...session.dashboardPermissions]).includes('registrationRequests'));
}

function asciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => normalizeNumericInput(digit, 1));
}

export function initialRegistrationAcceptanceForm(request: ManagedRegistrationRequest): RegistrationAcceptanceForm {
  return { name: request.name, guardianPhone: request.guardianPhone, nationalId: request.nationalId,
    age: request.age ? String(request.age) : '', complexId: request.complexId ? String(request.complexId) : '',
    committeeId: request.committeeId ? String(request.committeeId) : '', loginNumber: request.nationalId, password: '' };
}

export function updateRegistrationAcceptanceForm(form: RegistrationAcceptanceForm, field: keyof RegistrationAcceptanceForm, value: string): RegistrationAcceptanceForm {
  return { ...form, [field]: value, ...(field === 'complexId' && value !== form.complexId ? { committeeId: '' } : {}) };
}

export function registrationManagementComplexes(committees: readonly RegistrationManagementCommittee[]): { id: number; name: string }[] {
  const options = new Map<number, { id: number; name: string }>();
  for (const committee of committees) if (committee.complexId && committee.complexName.trim()) {
    options.set(committee.complexId, { id: committee.complexId, name: committee.complexName });
  }
  return [...options.values()];
}

export function registrationAcceptanceCommittees(committees: readonly RegistrationManagementCommittee[], complexId: string): RegistrationManagementCommittee[] {
  return committees.filter(committee => committee.complexId !== null && String(committee.complexId) === complexId);
}

export function completedRegistrationTests(request: ManagedRegistrationRequest, results: Readonly<Record<string, RegistrationTestResult>>): boolean {
  return request.memorization.items.every(item => ['passed', 'failed'].includes(results[item.id] || ''));
}

export function validateRegistrationAcceptance(request: ManagedRegistrationRequest, form: RegistrationAcceptanceForm,
  results: Readonly<Record<string, RegistrationTestResult>>, committees: readonly RegistrationManagementCommittee[]): RegistrationAcceptanceValidation {
  const invalid = (field: keyof RegistrationAcceptanceForm | 'testResults', message: string): RegistrationAcceptanceValidation => ({ valid: false, field, message });
  const name = form.name.replace(/\s+/g, ' ').trim();
  if (!name || name.length > 180) return invalid('name', 'اكتب اسم الطالب بحد أقصى 180 حرفًا.');
  const loginNumber = asciiDigits(form.loginNumber).trim();
  if (!/^\d{1,80}$/.test(loginNumber)) return invalid('loginNumber', 'رقم الدخول يجب أن يتكون من 1 إلى 80 رقمًا.');
  if (!form.password.length || form.password.length > 256) return invalid('password', 'أدخل كلمة مرور بحد أقصى 256 حرفًا.');
  const age = Number(normalizeNumericInput(form.age, Number.MAX_SAFE_INTEGER));
  if (!Number.isInteger(age) || age < 4 || age > 120) return invalid('age', 'العمر يجب أن يكون بين 4 و120 سنة.');
  let guardianPhone: string, nationalId: string;
  try { guardianPhone = normalizeOptionalPhone(form.guardianPhone); }
  catch { return invalid('guardianPhone', 'أدخل رقم جوال من 9 إلى 15 رقمًا أو اتركه فارغًا.'); }
  try { nationalId = normalizeOptionalIdentity(form.nationalId); }
  catch { return invalid('nationalId', 'أدخل رقم هوية من 10 أرقام أو اتركه فارغًا.'); }
  if (!registrationManagementComplexes(committees).some(complex => String(complex.id) === form.complexId)) return invalid('complexId', 'اختر المجمع.');
  if (!registrationAcceptanceCommittees(committees, form.complexId).some(committee => String(committee.id) === form.committeeId)) return invalid('committeeId', 'اختر حلقة تابعة للمجمع.');
  if (!completedRegistrationTests(request, results)) return invalid('testResults', 'حدد نتيجة اختبار كل محفوظ قبل القبول.');
  // Failed items do not prevent acceptance; only passed ranges become prior memorization on the server.
  const testResults = Object.fromEntries(request.memorization.items.map(item => [item.id, results[item.id] as RegistrationTestResult]));
  return { valid: true, payload: { ...form, name, loginNumber, guardianPhone, nationalId, age: String(age), testResults } };
}

export function filterRegistrationRequests(requests: readonly ManagedRegistrationRequest[], search: string, filter: RegistrationRequestFilter): ManagedRegistrationRequest[] {
  const query = asciiDigits(search).trim().toLocaleLowerCase();
  return requests.filter(request => (filter === 'all' || (filter === 'preliminary' ? Boolean(request.preliminarySentAt) : !request.preliminarySentAt))
    && (!query || asciiDigits([request.name, request.nationalId, request.guardianPhone, request.complexName, request.committeeName].join(' ')).toLocaleLowerCase().includes(query)));
}

export function registrationManagementDate(value: string | null): string {
  return formatHijriDate(String(value || '').slice(0, 10), { month: 'long' }) || '—';
}

export function registrationMemorizationLabel(request: ManagedRegistrationRequest): string {
  return formatJuzNumbers(request.memorization.juzs) || 'لا يوجد محفوظ سابق';
}

export function registrationActionMessage(action: 'preliminary' | 'accept' | 'reject', delivery: RegistrationDeliveryStatus): string {
  const outcome = action === 'accept' ? 'أُنشئ حساب الطالب.' : action === 'reject' ? 'رُفض الطلب وحُذف.' : 'حُفظ القبول المبدئي.';
  return `${outcome} ${delivery === 'sent' ? 'أُرسلت رسالة التواصل.' : delivery === 'failed' ? 'تعذر إرسال رسالة التواصل.' : 'لا يوجد تأكيد لإرسال رسالة التواصل.'}`;
}

export function registrationManagementFailure(cause: unknown): string {
  const error = cause && typeof cause === 'object' ? cause as { status?: unknown; code?: unknown } : {};
  if (error.status === 401 || error.code === 'unauthorized') return 'انتهت جلسة الدخول. سجل الدخول مجددًا.';
  if (error.status === 403 || error.code === 'forbidden') return 'ليست لديك صلاحية لإدارة طلبات التسجيل.';
  if (error.status === 404 || error.code === 'not-found') return 'طلب التسجيل غير موجود. حدّث قائمة الطلبات.';
  if (error.status === 409 || error.code === 'conflict') return 'رقم الدخول أو الهوية مستخدمان. راجعهما ثم حاول مجددًا.';
  if (error.status === 422 || error.code === 'validation') return 'راجع بيانات الطالب والحلقة ونتائج الاختبار ثم حاول مجددًا.';
  if (error.status === 429 || error.code === 'rate-limited') return 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.';
  if (error.code === 'network' || error.code === 'timeout') return 'تعذر الاتصال. تحقق من الشبكة ثم حدّث الطلبات قبل إعادة المحاولة.';
  return 'تعذر تأكيد العملية. حدّث الطلبات قبل إعادة المحاولة.';
}

export function registrationMutationNeedsReload(cause: unknown): boolean {
  const detail = cause && typeof cause === 'object' ? cause as { status?: unknown; code?: unknown } : {};
  return ['network', 'timeout', 'server', 'invalid-response'].includes(String(detail.code))
    || (typeof detail.status === 'number' && detail.status >= 500)
    || (!detail.code && !detail.status);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
  return value as Record<string, unknown>;
}
function text(value: unknown, nullable = false): string {
  if (nullable && (value === null || value === undefined)) return '';
  if (typeof value !== 'string') throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
  return value;
}
function id(value: unknown, nullable = false): number | null {
  if (nullable && (value === null || value === undefined)) return null;
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
  return Number(value);
}
function positiveId(value: unknown): number { return id(value) as number; }

export function decodeRegistrationRequests(value: unknown): Pick<RegistrationManagementData, 'registrationEnabled' | 'requests'> {
  const response = record(value);
  if (typeof response.registrationEnabled !== 'boolean' || !Array.isArray(response.requests)) throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
  const requests = response.requests.map(value => {
    const row = record(value), memorization = record(row.memorization);
    if (!Array.isArray(memorization.items) || !Array.isArray(memorization.juzs) || !Number.isInteger(row.age) || Number(row.age) < 0) throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
    const items = memorization.items.map(value => {
      const item = record(value), itemId = text(item.id);
      if (!itemId || ['__proto__', 'constructor', 'prototype'].includes(itemId) || (item.type !== 'juz' && item.type !== 'range')) throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
      const juz = item.juz === null || item.juz === undefined ? null : positiveId(item.juz);
      if (juz !== null && juz > 30) throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
      return { id: itemId, type: item.type as 'juz' | 'range', label: text(item.label), juz };
    });
    if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
    const juzs = memorization.juzs.map(positiveId);
    if (juzs.some(juz => juz > 30)) throw new Error('تعذر قراءة بيانات طلبات التسجيل.');
    const rawResults = record(row.testResults);
    const testResults = Object.fromEntries(items.flatMap(item => (rawResults[item.id] === 'passed' || rawResults[item.id] === 'failed')
      ? [[item.id, rawResults[item.id] as RegistrationTestResult]] : []));
    return { id: positiveId(row.id), name: text(row.name), guardianPhone: text(row.guardianPhone, true), nationalId: text(row.nationalId, true), age: Number(row.age),
      complexId: id(row.complexId, true), complexName: text(row.complexName, true), committeeId: id(row.committeeId, true), committeeName: text(row.committeeName, true),
      memorization: { items, juzs: [...new Set(juzs)] }, testResults, preliminarySentAt: row.preliminarySentAt == null ? null : text(row.preliminarySentAt), createdAt: text(row.createdAt, true) };
  });
  return { registrationEnabled: response.registrationEnabled, requests };
}

export function decodeRegistrationManagementCommittees(value: unknown): RegistrationManagementCommittee[] {
  if (!Array.isArray(value)) throw new Error('تعذر قراءة خيارات الحلقات.');
  return value.map(value => { const row = record(value); return { id: positiveId(row.id), name: text(row.name), complexId: id(row.complexId, true), complexName: text(row.complexName, true) }; });
}
export function decodeRegistrationOpenState(value: unknown): boolean {
  const response = record(value);
  if (typeof response.registrationEnabled !== 'boolean') throw new Error('تعذر قراءة حالة التسجيل.');
  return response.registrationEnabled;
}
export function decodeRegistrationAction(value: unknown): RegistrationActionResult {
  const result = record(value);
  if (result.ok !== true || (result.deliveryStatus != null && (typeof result.deliveryStatus !== 'string' || !['sent', 'failed', 'skipped'].includes(result.deliveryStatus)))) throw new Error('تعذر تأكيد عملية التسجيل.');
  return { ok: true, deliveryStatus: result.deliveryStatus == null ? null : result.deliveryStatus as RegistrationDeliveryStatus };
}
export function decodeRegistrationAcceptance(value: unknown): RegistrationAcceptanceResult {
  const response = record(value), student = record(response.student);
  const age = Number(student.age);
  if (!Number.isInteger(age) || age < 4 || age > 120) throw new Error('تعذر قراءة حساب الطالب.');
  return { ...decodeRegistrationAction(response), student: { id: positiveId(student.id), name: text(student.name), loginNumber: text(student.loginNumber),
    guardianPhone: text(student.guardianPhone, true), nationalId: text(student.nationalId, true), age, complexId: positiveId(student.complexId),
    complexName: text(student.complexName), committeeId: positiveId(student.committeeId), committeeName: text(student.committeeName) } };
}
