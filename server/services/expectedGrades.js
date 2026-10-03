import { loadSeasonalHolidays } from './seasonalHolidays.js';
import { isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { getBusinessDate } from '../../shared/business-date.js';
import { gradingMaxima, parseGradingPolicy } from '../../shared/grading-policy.js';
import { addDays, weekStartOf } from './grading.js';

/** All enrolled students contribute the possible grades, including unrecorded days/sessions. */
export async function loadExpectedGrades(connection, { from, to, policy, today = getBusinessDate() }) {
  const holidays = await loadSeasonalHolidays(connection);
  const end = to < today ? to : today;
  const [students] = await connection.query(`SELECT s.id, s.name, c.id AS committeeId, c.name AS committeeName,
    DATE_FORMAT(s.created_at, '%Y-%m-%d') AS joined
    FROM students s LEFT JOIN committees c ON c.id = s.committee_id
    WHERE ${connection.student('s.id')}`);
  const [stored] = await connection.query(`SELECT DATE_FORMAT(week_start, '%Y-%m-%d') AS weekStart, policy_json AS policy
    FROM grading_week_policies WHERE week_start BETWEEN ? AND ?`, [weekStartOf(from), end]);
  const policies = new Map(stored.map(row => [row.weekStart, parseGradingPolicy(row.policy)]));
  return students.map(student => {
    const start = student.joined > from ? student.joined : from;
    const result = { ...student, programMax: 0, trackMax: 0, weeklyMax: 0, weeks: 0, readingDays: 0, attendanceDays: 0 };
    const seen = new Set();
    for (let date = start; date <= end; date = addDays(date, 1)) {
      if (isSeasonalHoliday(date, holidays)) continue;
      const week = weekStartOf(date);
      const current = policies.get(week) || policy;
      const program = current.weeklyProgram;
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (program.workDays.includes(day)) {
        result.programMax += program.attendance.present + program.memorizationDaily + program.linkDaily + program.reviewDaily;
        result.attendanceDays++;
      }
      if (program.readingDays.includes(day)) {
        result.programMax += program.readingDaily;
        result.readingDays++;
      }
      if (!seen.has(week)) {
        seen.add(week);
        const maxima = gradingMaxima(current);
        result.trackMax += maxima.trackSession;
        result.weeklyMax += maxima.weeklySession;
        result.weeks++;
      }
    }
    return result;
  });
}

export function includeUnrecordedGrades(students, recorded, component) {
  const byId = new Map(recorded.map(row => [String(row.id), row]));
  const key = { program: 'programMax', track: 'trackMax', weekly: 'weeklyMax' }[component];
  return students.map(student => ({
    ...student, grade: 0, ...(component === 'program' ? {} : { attended: 0, absent: 0 }),
    ...byId.get(String(student.id)), max: student[key],
  }));
}
