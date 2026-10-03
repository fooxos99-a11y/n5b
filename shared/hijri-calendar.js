const dayMilliseconds = 86_400_000;
export const HIJRI_LOCALE = 'ar-SA-u-ca-islamic-umalqura-nu-latn';
const partsFormatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC',
});

export function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export const dateOnly = (date) => date.toISOString().slice(0, 10);
export const addCalendarDays = (date, days) => new Date(date.getTime() + days * dayMilliseconds);

export function hijriParts(date) {
  return Object.fromEntries(partsFormatter.formatToParts(date)
    .filter(({ type }) => ['year', 'month', 'day'].includes(type))
    .map(({ type, value }) => [type, Number(value)]));
}

export const hijriMonthStart = (date) => addCalendarDays(date, 1 - hijriParts(date).day);
export function shiftHijriMonth(date, amount) {
  let start = hijriMonthStart(date);
  for (let index = 0; index < Math.abs(amount); index++) {
    start = amount < 0 ? hijriMonthStart(addCalendarDays(start, -1)) : hijriMonthStart(addCalendarDays(start, 30));
  }
  return start;
}

export function hijriMonthRange(date) {
  const start = hijriMonthStart(date);
  const next = shiftHijriMonth(start, 1);
  return { from: dateOnly(start), to: dateOnly(addCalendarDays(next, -1)), days: Math.round((next - start) / dayMilliseconds) };
}

export function shiftHijriDate(date, months) {
  const start = shiftHijriMonth(date, months);
  return addCalendarDays(start, Math.min(hijriParts(date).day, hijriMonthRange(start).days) - 1);
}

export function formatHijriDate(value, options = {}) {
  const date = value instanceof Date ? value : parseDateOnly(value);
  if (!date || !Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(HIJRI_LOCALE, {
    day: 'numeric', month: 'numeric', year: 'numeric', ...options, timeZone: 'UTC',
  }).format(date);
}

export function formatHijriDateTime(value) {
  if (!value) return '';
  const text = String(value).trim().replace(' ', 'T');
  // SQL timestamps without an offset are local Saudi times, regardless of the device timezone.
  const date = value instanceof Date ? value : new Date(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text) ? `${text}+03:00` : text,
  );
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(HIJRI_LOCALE, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh',
  }).format(date);
}
