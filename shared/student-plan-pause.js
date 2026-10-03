import { isSeasonalHoliday } from './seasonal-holidays.js';
import { getBusinessDate, shiftDateOnly } from './business-date.js';

export const STUDENT_PLAN_PAUSE_KEY = 'studentPlanPause';
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const invalid = () => Object.assign(new Error('سجل إيقاف الخطط غير صحيح.'), { status: 422 });

export function parseStudentPlanPause(value) {
  if (!value) return { revision: 0, periods: [] };
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw invalid(); }
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.periods)) throw invalid();
  let previousEnd = '';
  const periods = value.periods.map((period, index) => {
    if (!validDate(period.startDate) || (period.endDate !== null && (!validDate(period.endDate) || period.endDate < period.startDate))
      || (index && (!previousEnd || period.startDate <= previousEnd)) || (period.endDate === null && index !== value.periods.length - 1)) throw invalid();
    previousEnd = period.endDate;
    return { ...period, startDate: period.startDate, endDate: period.endDate };
  });
  return { revision: value.revision, periods };
}

export function studentPlanPauseStatus(value) {
  const state = parseStudentPlanPause(value);
  const last = state.periods.at(-1);
  return { revision: state.revision, paused: Boolean(last && last.endDate === null), pausedFrom: last?.endDate === null ? last.startDate : null };
}

export function changeStudentPlanPause(value, { paused, revision, date, actor }) {
  const state = parseStudentPlanPause(value);
  if (typeof paused !== 'boolean' || !Number.isSafeInteger(revision) || revision < 0 || !validDate(date)) throw invalid();
  if (studentPlanPauseStatus(state).paused === paused) return state;
  if (revision !== state.revision) throw Object.assign(new Error('تغيّرت حالة الخطط. حدّث الصفحة وحاول مجددًا.'), { status: 409 });
  const periods = state.periods.map(period => ({ ...period }));
  if (paused) {
    if (periods.at(-1)?.endDate >= date) throw Object.assign(new Error('لا يمكن تغيير سجل الإيقاف السابق.'), { status: 409 });
    periods.push({ startDate: date, endDate: null, pausedBy: actor });
  } else {
    const current = periods.at(-1);
    if (date < current.startDate) throw invalid();
    // Resumption starts today. A pause and resume on the same day excludes no study day.
    if (date === current.startDate) periods.pop();
    else Object.assign(current, { endDate: shiftDateOnly(date, -1), resumedBy: actor });
  }
  return { revision: state.revision + 1, periods };
}

export function studentPlanPauseHolidays(value, throughDate = getBusinessDate()) {
  return parseStudentPlanPause(value).periods.map(period => ({ startDate: period.startDate, endDate: period.endDate || throughDate }))
    .filter(period => period.startDate <= period.endDate);
}

export function isStudentPlanPausedOn(date, value) {
  return parseStudentPlanPause(value).periods.some(period => date >= period.startDate && (!period.endDate || date <= period.endDate));
}

export function isStudentStudyHoliday(date, settings) {
  return isSeasonalHoliday(date, settings?.seasonalHolidays) || isStudentPlanPausedOn(date, settings?.planPause);
}
