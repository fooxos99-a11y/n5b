import { getSaudiCalendarDate } from '../../shared/business-date.js';
import { dateOnly, hijriMonthStart, hijriParts, parseDateOnly, shiftHijriMonth } from '../../shared/hijri-calendar.js';

export const REPORT_PERIOD_LABELS = Object.freeze({
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  quarter: 'هذا الربع',
  year: 'هذه السنة',
  custom: 'مخصص',
});

export const DEFAULT_REPORT_PERIOD = 'month';

/** First day of the period that contains `today` (weeks start on Sunday). */
export function reportPeriodStart(period, today = getSaudiCalendarDate()) {
  const date = parseDateOnly(today);
  if (!date) return '';
  const { month } = hijriParts(date);
  if (period === 'year') return dateOnly(shiftHijriMonth(date, 1 - month));
  if (period === 'quarter') return dateOnly(shiftHijriMonth(date, -((month - 1) % 3)));
  if (period === 'month') return dateOnly(hijriMonthStart(date));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

/** The requested range: a named period runs to today; a custom one uses its own dates. */
export function reportRange(period, custom = {}, today = getSaudiCalendarDate()) {
  if (period === 'custom') {
    const from = custom.from || today;
    const to = custom.to || today;
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return { from: reportPeriodStart(period, today), to: today };
}
