export const CALL_RECORDING_LABELS = Object.freeze({
  unconfigured: 'التسجيل غير مفعّل', waiting: 'بانتظار مشارك آخر', starting: 'جارٍ تجهيز التسجيل',
  recording: 'التسجيل جارٍ', stopping: 'جارٍ حفظ التسجيل', ready: 'التسجيل محفوظ',
  completed: 'التسجيل محفوظ', processing: 'التسجيل محفوظ', failed: 'تعذر التسجيل', partial: 'التسجيل غير مكتمل',
  empty: 'لا يوجد تسجيل', pending: 'بانتظار التسجيل',
});
export const CALL_REPORT_LABELS = Object.freeze({
  unconfigured: 'التحليل غير مفعّل', waiting: 'بانتظار اكتمال التسجيل', pending: 'التقرير قيد الانتظار',
  queued: 'التقرير قيد الانتظار', processing: 'جارٍ إعداد التقرير', ready: 'التقرير جاهز',
  completed: 'التقرير جاهز', failed: 'تعذر إعداد التقرير', disabled: 'التحليل غير مفعّل',
});
export const recordingLabel = state => CALL_RECORDING_LABELS[state] || 'حالة التسجيل غير متاحة';
export const reportLabel = state => CALL_REPORT_LABELS[state] || 'التقرير غير متاح';
export function callTime(seconds = 0) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
export function callDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
export function callArchiveLink(roomId, sessionId, href = window.location.href) {
  const url = new URL(href);
  url.searchParams.set('callArchiveRoom', String(roomId));
  if (sessionId) url.searchParams.set('callSession', String(sessionId));
  else url.searchParams.delete('callSession');
  return url.href;
}
