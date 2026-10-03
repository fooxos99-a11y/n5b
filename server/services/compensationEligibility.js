import { loadGradingPolicy, weekStartOf, weekdayOf } from './grading.js';
import { loadSeasonalHolidays } from './seasonalHolidays.js';
import { isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { parseGradingPolicy, trackSegmentDefinitions } from '../../shared/grading-policy.js';

/** Session dates come from settings; only approved excuses after the first plan are candidates. */
export function eligibleCompensationDays({ firstPlanDate, lowerBound, today, sessionDay, candidates, compensatedPeriods, holidays, scope, policyForDate }) {
  if (!firstPlanDate || sessionDay == null) return [];
  const start = [firstPlanDate, lowerBound].filter(Boolean).sort().at(-1);
  return [...new Set(candidates)].sort().filter(date => {
    if (date < start || date > today || weekdayOf(date) !== sessionDay || isSeasonalHoliday(date, holidays)) return false;
    if (compensatedPeriods.has(scope === 'track' ? weekStartOf(date) : date)) return false;
    const policy = policyForDate(date);
    if (scope === 'track') return trackSegmentDefinitions(policy).some(segment => segment.max > 0);
    const program = policy.weeklyProgram, day = weekdayOf(date);
    return (program.workDays.includes(day) && [program.memorizationDaily, program.linkDaily, program.reviewDaily].some(max => max > 0))
      || (program.readingDays.includes(day) && program.readingDaily > 0);
  }).map(date => ({ date, dayNumber: Math.floor((Date.parse(date) - Date.parse(firstPlanDate)) / 86400000) + 1 }));
}

/** Batch loading keeps session lists independent of the number of students. */
export async function loadEligibleCompensationDays(connection, { studentIds, scope, today }) {
  const result = new Map(studentIds.map(id => [Number(id), []]));
  if (!studentIds.length) return result;
  const policy = await loadGradingPolicy(connection);
  const sessionDay = policy[scope === 'track' ? 'trackSession' : 'weeklySession'].sessionDay;
  if (sessionDay == null) return result;
  const component = scope === 'track' ? 'track' : 'weekly';
  const [students] = await connection.query(`SELECT s.id, DATE_FORMAT(s.created_at, '%Y-%m-%d') AS joined,
    DATE_FORMAT(MIN(COALESCE(p.start_date, DATE(p.created_at))), '%Y-%m-%d') AS firstPlanDate
    FROM students s LEFT JOIN student_quran_plans p ON p.student_id = s.id WHERE s.id IN (?) GROUP BY s.id`, [studentIds]);
  const [settings] = await connection.query("SELECT setting_value AS value FROM app_settings WHERE setting_key IN ('currentTermStartDate', 'gradePointsResetDate')");
  const [excuses] = await connection.query(`SELECT student_id AS studentId, DATE_FORMAT(record_date, '%Y-%m-%d') AS date
    FROM attendance_records WHERE student_id IN (?) AND status = 'excused' AND record_date <= ?
    UNION SELECT student_id, DATE_FORMAT(excuse_date, '%Y-%m-%d') FROM student_excuse_approvals WHERE student_id IN (?) AND excuse_date <= ?
    UNION SELECT student_id, DATE_FORMAT(DATE_ADD(week_start, INTERVAL ? DAY), '%Y-%m-%d') FROM student_weekly_components
    WHERE student_id IN (?) AND component = ? AND JSON_UNQUOTE(JSON_EXTRACT(detail_json, '$.attendanceStatus')) = 'excused'`,
  [studentIds, today, studentIds, today, sessionDay, studentIds, component]);
  const [credits] = await connection.query(`SELECT student_id AS studentId, DATE_FORMAT(period_date, '%Y-%m-%d') AS period
    FROM student_day_compensations WHERE student_id IN (?) AND scope = ? AND cancelled_at IS NULL`, [studentIds, scope]);
  const weeks = [...new Set(excuses.map(row => weekStartOf(row.date)))];
  const [frozen] = weeks.length ? await connection.query("SELECT DATE_FORMAT(week_start, '%Y-%m-%d') AS week, policy_json AS policy FROM grading_week_policies WHERE week_start IN (?)", [weeks]) : [[]];
  const policies = new Map(frozen.map(row => [row.week, parseGradingPolicy(row.policy)]));
  const holidays = await loadSeasonalHolidays(connection);
  for (const student of students) {
    const id = Number(student.id);
    result.set(id, eligibleCompensationDays({ firstPlanDate: student.firstPlanDate,
      lowerBound: [student.joined, ...settings.map(row => row.value)].filter(Boolean).sort().at(-1),
      today, sessionDay, scope, holidays, candidates: excuses.filter(row => Number(row.studentId) === id).map(row => row.date),
      compensatedPeriods: new Set(credits.filter(row => Number(row.studentId) === id).map(row => row.period)),
      policyForDate: date => policies.get(weekStartOf(date)) || policy }));
  }
  return result;
}
