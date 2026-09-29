import { getBusinessDate } from '../../../../shared/business-date.js';
import { DEFAULT_PLAN_READING_FACES } from '../../../../shared/quran-plan-options.js';

export const WEEKDAY_LABELS = Object.freeze(['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']);
export const ATTENDANCE_LABELS = Object.freeze({ present: 'حاضر', late: 'متأخر', excused: 'مستأذن', absent: 'غائب' });
export const ALL_COMMITTEES = 'all';

const dayMonthFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const fullDateFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const toDate = (isoDate) => new Date(`${isoDate}T00:00:00Z`);

/** Business date used by the server to reject future records. */
export const todayDate = () => getBusinessDate();

export const addDays = (isoDate, days) => {
  const date = toDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Sunday that starts the week of `isoDate`, matching the server's grading weeks. */
export const weekStartOf = (isoDate) => addDays(isoDate, -toDate(isoDate).getUTCDay());

/** Weeks between two week starts, as the label of a past week: «هذا الأسبوع»، «الأسبوع الماضي»، «2 الأسبوع الماضي»… */
export const weeksAgo = (weekStart, currentWeekStart) => Math.round((toDate(currentWeekStart) - toDate(weekStart)) / (7 * 86400000));
export const relativeWeekLabel = (offset) => {
  if (offset <= 0) return 'هذا الأسبوع';
  if (offset === 1) return 'الأسبوع الماضي';
  return `قبل ${offset} أسابيع`;
};

export const formatNumber = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });
export const formatDayMonth = (isoDate) => (isoDate ? dayMonthFormatter.format(toDate(isoDate)) : '');
export const formatWeekRange = (from, to) => (from && to ? `${formatDayMonth(from)} – ${fullDateFormatter.format(toDate(to))}` : '');

export const committeeQuery = (committeeId) => (committeeId === ALL_COMMITTEES ? undefined : committeeId);
export const requiredReadingFaces = (student) => student?.readingFaces ?? DEFAULT_PLAN_READING_FACES;
