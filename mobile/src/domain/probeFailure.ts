export type ProbeStage = 'native-platform' | 'secure-store-availability' | 'secure-store-read-key'
  | 'database-file-check' | 'key-generation' | 'secure-store-write-key' | 'key-validation'
  | 'database-open' | 'database-key' | 'cipher-check' | 'database-initialize'
  | 'save-records' | 'restore-draft' | 'restore-session' | 'scope-isolation' | 'database-close';
type ErrorKind = 'Error' | 'TypeError' | 'RangeError' | 'Unknown';
type FailureCode = 'runtime-error' | 'secure-store-unavailable' | 'missing-key' | 'invalid-key'
  | 'cipher-unavailable' | 'scope-leak' | 'native-required' | 'database-path-invalid';
const messages: Record<FailureCode, string> = {
  'runtime-error': 'تعذّر فحص التخزين. أعد المحاولة من نسخة التطوير.',
  'secure-store-unavailable': 'التخزين الآمن غير متاح على هذا الجهاز.',
  'missing-key': 'مفتاح التخزين مفقود. احتفظ ببيانات التجربة لفحص الاستعادة.',
  'invalid-key': 'مفتاح التخزين غير صالح.',
  'cipher-unavailable': 'التشفير غير متاح. ثبّت نسخة التطوير المجهزة للتجربة.',
  'scope-leak': 'فشل فصل بيانات التجربة بين الحسابات والجهات.',
  'native-required': 'فحص التخزين المشفر يحتاج نسخة تطوير على Android أو iPhone.',
  'database-path-invalid': 'موقع تخزين التجربة غير صالح. احتفظ بالبيانات لفحص الإعدادات.',
};

export class ProbeFailure extends Error {
  cleanupFailed = false;
  constructor(readonly stage: ProbeStage, readonly code: FailureCode, readonly kind: ErrorKind = 'Error') {
    super(messages[code]);
    this.name = 'ProbeFailure';
  }
}

export async function atProbeStage<T>(stage: ProbeStage, work: () => T | Promise<T>): Promise<T> {
  try { return await work(); }
  catch (cause) {
    if (cause instanceof ProbeFailure) throw cause;
    const kind = cause instanceof TypeError ? 'TypeError' : cause instanceof RangeError ? 'RangeError'
      : cause instanceof Error ? 'Error' : 'Unknown';
    // Native error messages/codes can contain SQL, paths or bound values. Keep only a fixed category.
    throw new ProbeFailure(stage, 'runtime-error', kind);
  }
}

export function formatProbeFailure(cause: unknown): string {
  const failure = cause instanceof ProbeFailure ? cause : new ProbeFailure('database-open', 'runtime-error');
  return `${failure.message} المرحلة: ${failure.stage}؛ النوع: ${failure.kind}؛ الرمز: ${failure.code}.`
    + (failure.cleanupFailed ? ' تعذّر أيضًا إغلاق الاتصال بعد الخطأ.' : '');
}
