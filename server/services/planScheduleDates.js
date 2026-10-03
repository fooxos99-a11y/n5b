import { loadSeasonalHolidays } from './seasonalHolidays.js';
import { isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { parseGradingPolicy } from '../../shared/grading-policy.js';
import { addDays, weekStartOf } from './grading.js';

/** Historic weeks keep their recorded policy; unsnapshotted weeks use current work days. */
export async function planScheduleDates(connection, from, to, fallbackDays, component = 'workDays') {
  if (!['workDays', 'readingDays'].includes(component)) throw new Error('Invalid schedule component');
  if (!from || from > to) return [];
  const [rows] = await connection.query(`SELECT DATE_FORMAT(week_start, '%Y-%m-%d') AS weekStart, policy_json AS policy
    FROM grading_week_policies WHERE week_start BETWEEN ? AND ?`, [weekStartOf(from), weekStartOf(to)]);
  const holidays = await loadSeasonalHolidays(connection);
  const daysByWeek = new Map(rows.map(row => [row.weekStart, parseGradingPolicy(row.policy).weeklyProgram[component]]));
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const days = daysByWeek.get(weekStartOf(date)) || fallbackDays;
    if (!isSeasonalHoliday(date, holidays) && days.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) dates.push(date);
  }
  return dates;
}
