import { expandJuzRanges, formatJuzRange, mergeJuzRanges } from '../../../src/lib/juzRanges.js';
import { normalizeSiteRegistrationNumber } from '../../../shared/registration-link.js';

export type RegistrationIdentifier = number | string;
export type RegistrationComplex = { id: RegistrationIdentifier; name: string };
export type RegistrationCommittee = RegistrationComplex & { complexId: RegistrationIdentifier; complexName?: string };
export type PublicRegistrationConfiguration = {
  enabled: boolean;
  juzRanges: readonly { juz: number }[];
  complexes: readonly RegistrationComplex[];
  committees: readonly RegistrationCommittee[];
};
export type RegistrationForm = {
  name: string; guardianPhone: string; nationalId: string; age: string; complexId: string; committeeId: string;
};
export type RegistrationRange = { startJuz: number; endJuz: number };
export type RegistrationRangeDraft = { startJuz: string; endJuz: string };
export type RegistrationRequestPayload = RegistrationForm & { memorization: { fullJuzs: number[] } };
export type RegistrationSubmissionResult = { ok: true; id: RegistrationIdentifier };
export type RegistrationValidation = { valid: true; payload: RegistrationRequestPayload }
  | { valid: false; field: keyof RegistrationForm | 'rangeDraft' | 'context'; message: string };

export const emptyRegistrationForm = (): RegistrationForm => ({ name: '', guardianPhone: '', nationalId: '', age: '', complexId: '', committeeId: '' });
export const emptyRegistrationRangeDraft = (): RegistrationRangeDraft => ({ startJuz: '', endJuz: '' });

export function clearRegistrationRangeDraft(): RegistrationRangeDraft {
  return emptyRegistrationRangeDraft();
}

export function registrationSubmissionFailure(cause: unknown): { kind: 'closed' | 'duplicate' | 'rate-limited' | 'network' | 'other'; message: string } {
  const detail = cause && typeof cause === 'object' ? cause as { status?: unknown; code?: unknown } : {};
  if (detail.status === 403) return { kind: 'closed', message: 'التسجيل مغلق حاليًا. حاول عند فتحه مجددًا.' };
  if (detail.status === 409) return { kind: 'duplicate', message: 'يوجد طلب تسجيل بهذه البيانات.' };
  if (detail.status === 429 || detail.code === 'rate-limited') return { kind: 'rate-limited', message: 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.' };
  if (detail.code === 'network' || detail.code === 'timeout') return { kind: 'network', message: 'تعذر الاتصال. تحقق من الشبكة ثم حاول مجددًا.' };
  return { kind: 'other', message: 'تعذر إرسال الطلب. حاول مرة أخرى.' };
}

export function registrationDigits(value: string, maxLength = 40): string {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return value.replace(/[٠-٩۰-۹]/g, digit => String(arabic.includes(digit) ? arabic.indexOf(digit) : persian.indexOf(digit)))
    .replace(/\D/g, '').slice(0, maxLength);
}

export function updateRegistrationField(form: RegistrationForm, field: keyof RegistrationForm, value: string): RegistrationForm {
  const normalized = ['guardianPhone', 'nationalId', 'age'].includes(field) ? registrationDigits(value, field === 'age' ? 3 : 40) : value;
  return { ...form, [field]: normalized, ...(field === 'complexId' ? { committeeId: '' } : {}) };
}

export function updateRegistrationRangeDraft(draft: RegistrationRangeDraft, field: keyof RegistrationRangeDraft, value: string): RegistrationRangeDraft {
  return { ...draft, [field]: value, ...(field === 'startJuz' && !draft.endJuz ? { endJuz: value } : {}) };
}

export function registrationJuzOptions(config: PublicRegistrationConfiguration): number[] {
  const available = [...new Set(config.juzRanges.map(range => range.juz).filter(juz => Number.isInteger(juz) && juz >= 1 && juz <= 30))].sort((a, b) => a - b);
  return available.length ? available : Array.from({ length: 30 }, (_, index) => index + 1);
}

export function registrationCommittees(config: PublicRegistrationConfiguration, complexId: string): RegistrationCommittee[] {
  return config.committees.filter(committee => String(committee.complexId) === complexId);
}

export function addRegistrationRange(ranges: readonly RegistrationRange[], draft: RegistrationRangeDraft):
  { valid: true; ranges: RegistrationRange[] } | { valid: false; message: string } {
  if (!draft.startJuz || !draft.endJuz) return { valid: false, message: 'حدد بداية ونهاية نطاق الأجزاء' };
  const startJuz = Number(draft.startJuz), endJuz = Number(draft.endJuz);
  if (![startJuz, endJuz].every(juz => Number.isInteger(juz) && juz >= 1 && juz <= 30)) return { valid: false, message: 'حدد بداية ونهاية نطاق الأجزاء' };
  if (startJuz > endJuz) return { valid: false, message: 'جزء البداية يجب أن يكون قبل جزء النهاية' };
  return { valid: true, ranges: mergeJuzRanges([...ranges, { startJuz, endJuz }]) };
}

export function removeRegistrationRange(ranges: readonly RegistrationRange[], index: number): RegistrationRange[] {
  return ranges.filter((_, rangeIndex) => rangeIndex !== index).map(range => ({ ...range }));
}

export function registrationRangeLabel(range: RegistrationRange): string {
  return formatJuzRange(range);
}

export function validateRegistrationForm(form: RegistrationForm, config: PublicRegistrationConfiguration,
  draft: RegistrationRangeDraft, ranges: readonly RegistrationRange[]): RegistrationValidation {
  if (!config.enabled) return { valid: false, field: 'context', message: 'التسجيل مغلق حالياً.' };
  const name = form.name.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 180) return { valid: false, field: 'name', message: 'اكتب اسم الطالب.' };
  const age = Number(form.age);
  if (!Number.isInteger(age) || age < 4 || age > 120) return { valid: false, field: 'age', message: 'العمر غير صحيح.' };
  if (!config.complexes.some(complex => String(complex.id) === form.complexId)) return { valid: false, field: 'complexId', message: 'اختر المجمع.' };
  if (!registrationCommittees(config, form.complexId).some(committee => String(committee.id) === form.committeeId)) return { valid: false, field: 'committeeId', message: 'اختر الحلقة.' };
  if (draft.startJuz || draft.endJuz) return { valid: false, field: 'rangeDraft', message: 'أضف نطاق المحفوظ أو امسحه قبل إرسال الطلب.' };
  return { valid: true, payload: { ...form, name, memorization: { fullJuzs: expandJuzRanges([...ranges]) } } };
}

export function normalizeRegistrationContext(value: string): string {
  // The empty context remains supported by the current public endpoint's default context.
  if (!value.trim()) return '';
  const normalized = normalizeSiteRegistrationNumber(value);
  if (!normalized) throw new Error('رابط التسجيل غير صالح.');
  return normalized;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('تعذر قراءة بيانات التسجيل.');
  return value as Record<string, unknown>;
}

function identifier(value: unknown): RegistrationIdentifier {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^[1-9]\d*$/.test(String(value).trim()) || !Number.isSafeInteger(Number(value))) throw new Error('تعذر قراءة بيانات التسجيل.');
  return typeof value === 'string' ? value.trim() : value;
}

function namedOption(value: unknown): RegistrationComplex {
  const option = record(value);
  if (typeof option.name !== 'string' || !option.name.trim()) throw new Error('تعذر قراءة بيانات التسجيل.');
  return { id: identifier(option.id), name: option.name };
}

export function decodePublicRegistrationConfiguration(value: unknown): PublicRegistrationConfiguration {
  const config = record(value);
  if (typeof config.enabled !== 'boolean' || !Array.isArray(config.complexes) || !Array.isArray(config.committees) || !Array.isArray(config.juzRanges)) throw new Error('تعذر قراءة بيانات التسجيل.');
  return { enabled: config.enabled, complexes: config.complexes.map(namedOption),
    committees: config.committees.map(value => {
      const option = record(value);
      return { ...namedOption(option), complexId: identifier(option.complexId), ...(typeof option.complexName === 'string' ? { complexName: option.complexName } : {}) };
    }),
    juzRanges: config.juzRanges.map(value => {
      const juz = Number(record(value).juz);
      if (!Number.isInteger(juz) || juz < 1 || juz > 30) throw new Error('تعذر قراءة بيانات التسجيل.');
      return { juz };
    }) };
}

export function decodeRegistrationSubmissionResult(value: unknown): RegistrationSubmissionResult {
  const result = record(value);
  if (result.ok !== true) throw new Error('تعذر قراءة نتيجة إرسال الطلب.');
  return { ok: true, id: identifier(result.id) };
}
