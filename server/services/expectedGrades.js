import { loadSeasonalHolidays } from './seasonalHolidays.js';
import { loadIndividualStudentPlanPauses } from './studentPlanPause.js';
import { isStudentPlanPausedOn } from '../../shared/student-plan-pause.js';
import { isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { getSaudiCalendarDate } from '../../shared/business-date.js';
import { gradingPolicyForDate, gradingMaxima, parseGradingPolicy, trackSegmentDefinitions } from '../../shared/grading-policy.js';
import { addDays, weekStartOf } from './grading.js';

/** All enrolled students contribute the possible grades, including unrecorded days/sessions. */
export async function loadExpectedGrades(connection, { from, to, policy, today = getSaudiCalendarDate() }) {
  const holidays = await loadSeasonalHolidays(connection);
  const individualPauses = await loadIndividualStudentPlanPauses(connection);
  const end = to < today ? to : today;
  const [students] = await connection.query(`SELECT s.id, s.name, c.id AS committeeId, c.name AS committeeName,
    DATE_FORMAT(s.created_at, '%Y-%m-%d') AS joined
    FROM students s LEFT JOIN committees c ON c.id = s.committee_id
    WHERE ${connection.student('s.id')}`);
  const [stored] = await connection.query(`SELECT DATE_FORMAT(week_start, '%Y-%m-%d') AS weekStart, policy_json AS policy
    FROM grading_week_policies WHERE week_start BETWEEN ? AND ?`, [weekStartOf(from), end]);
  const policies = new Map(stored.map(row => [row.weekStart, parseGradingPolicy(row.policy)]));
  const [recordedSessions] = from <= end ? await connection.query(`SELECT student_id AS studentId, component,
    DATE_FORMAT(week_start, '%Y-%m-%d') AS weekStart, policy_json AS policy
    FROM student_weekly_components WHERE week_start BETWEEN ? AND ? AND ${connection.student('student_id')}`, [weekStartOf(from), end]) : [[]];
  const recordedPolicies = new Map(recordedSessions.map(row => [`${row.studentId}:${row.component}:${row.weekStart || weekStartOf(from)}`, parseGradingPolicy(row.policy)]));
  return students.map(student => {
    const start = student.joined > from ? student.joined : from;
    const result = { ...student, programMax: 0, trackMax: 0, weeklyMax: 0, weeks: 0, trackWeeks: 0, weeklyWeeks: 0, expectedSegments: 0, readingDays: 0, attendanceDays: 0 };
    const seen = new Set();
    for (let date = start; date <= end; date = addDays(date, 1)) {
      if (isSeasonalHoliday(date, holidays) || isStudentPlanPausedOn(date, individualPauses[student.id])) continue;
      const week = weekStartOf(date);
      const current = policies.get(week) || policy;
      const program = gradingPolicyForDate(current, date).weeklyProgram;
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (program.workDays.includes(day)) {
        result.programMax += program.attendance.present + program.memorizationDaily + program.linkDaily + program.reviewDaily;
        result.attendanceDays++;
      }
      if (program.readingDays.includes(day)) {
        result.programMax += program.readingDaily;
        result.readingDays++;
      }
      if (!seen.has(week)) { seen.add(week); result.weeks++; }
      for (const component of ['track', 'weekly']) {
        const recordedPolicy = recordedPolicies.get(`${student.id}:${component}:${week}`);
        const sessionPolicy = recordedPolicy || current;
        const sessionDay = (recordedPolicy || policy)[`${component}Session`].sessionDay ?? 0;
        if (day !== sessionDay) continue;
        result[`${component}Max`] += gradingMaxima(sessionPolicy)[`${component}Session`];
        result[`${component}Weeks`]++;
        if (component === 'track') result.expectedSegments += trackSegmentDefinitions(sessionPolicy).length;
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
    ...(component === 'track' && student.trackWeeks !== undefined ? { weeks: student.trackWeeks } : {}),
    ...(component === 'weekly' && student.weeklyWeeks !== undefined ? { weeks: student.weeklyWeeks } : {}),
  }));
}
