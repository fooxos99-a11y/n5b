import { getBusinessDate } from '../../shared/business-date.js';

export const REPORT_PERIOD_LABELS = Object.freeze({
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  quarter: 'هذا الربع',
  year: 'هذه السنة',
  custom: 'مخصص',
});

export const DEFAULT_REPORT_PERIOD = 'month';

/** First day of the period that contains `today` (weeks start on Sunday). */
export function reportPeriodStart(period, today = getBusinessDate()) {
  const [year, month] = today.split('-').map(Number);
  if (period === 'year') return `${year}-01-01`;
  if (period === 'quarter') return `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
  if (period === 'month') return `${today.slice(0, 7)}-01`;
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

/** The requested range: a named period runs to today; a custom one uses its own dates. */
export function reportRange(period, custom = {}, today = getBusinessDate()) {
  if (period === 'custom') {
    const from = custom.from || today;
    const to = custom.to || today;
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return { from: reportPeriodStart(period, today), to: today };
}
