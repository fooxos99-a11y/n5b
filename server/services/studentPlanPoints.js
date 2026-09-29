import { roundPoints } from './studentPoints.js';
import { GRADE_POINTS_SOURCE } from './gradePoints.js';

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Daily points: grade points are the day's earned points; every other ledger row is additional. */
export function buildStudentPlanPoints({ total, rows, transactions, attendance, today }) {
  const days = new Map();
  const dayFor = (date) => {
    if (!days.has(date)) days.set(date, { date, earned: 0, additionalEarned: 0, additionalDetails: [], pending: true, details: [] });
    return days.get(date);
  };
  for (const row of rows) {
    if (row.taskDate > today) continue;
    const day = dayFor(row.taskDate);
    if (row.evaluatedAt) day.pending = false;
  }
  for (const record of attendance) {
    if (record.date > today) continue;
    dayFor(record.date).pending = false;
  }
  for (const row of transactions) {
    if (row.date > today) continue;
    const day = dayFor(row.date);
    const value = row.type === 'deduction' ? -number(row.points) : number(row.points);
    const additional = row.source !== GRADE_POINTS_SOURCE;
    day.pending = false;
    day[additional ? 'additionalEarned' : 'earned'] = roundPoints(day[additional ? 'additionalEarned' : 'earned'] + value);
    day[additional ? 'additionalDetails' : 'details'].push({ label: row.reason || 'أخرى', earned: value });
  }
  return { total: number(total), days: [...days.values()] };
}
