export const countExpectedMemorizationDays = ({ pages, dailyPages }) => {
  const totalPages = Math.max(0, Number(pages || 0));
  const pagesPerDay = Math.max(0.25, Number(dailyPages || 1));
  return Math.ceil(totalPages / pagesPerDay);
};

/** Required execution days stay unchanged; the finish date skips weekly holidays. */
export function expectedPlanCompletion({ pages, dailyPages, startDate, weeklyHolidayDays = [5, 6] }) {
  const days = countExpectedMemorizationDays({ pages, dailyPages });
  const date = new Date(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(days) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== startDate) return {days, endDate: ''};
  if (!days) return {days: 0, endDate: ''};
  const holidays = new Set(weeklyHolidayDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6));
  if (holidays.size === 7) return {days, endDate: '', error: 'لا توجد أيام تنفيذ متاحة ضمن أيام الأسبوع.'};
  let remaining = days;
  while (remaining > 0) {
    if (!holidays.has(date.getUTCDay())) remaining--;
    if (remaining > 0) date.setUTCDate(date.getUTCDate() + 1);
  }
  return {days, endDate: date.toISOString().slice(0, 10)};
}
