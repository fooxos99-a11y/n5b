import { DEFAULT_PLAN_READING_FACES, MAX_PLAN_READING_FACES } from '../../shared/quran-plan-options.js';
import { assertGradeDate } from './gradeDateBoundary.js';
import { deleteDailyGrade, loadGradingPolicyForDate, recordReadingGrade } from './grading.js';
import { currentQuranPlanSql } from './currentQuranPlan.js';

const weekDayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Self reading is due on the weekly program's reading days (every day by default). */
export const isReadingDay = (policy, date) => (policy?.weeklyProgram?.readingDays || []).map(Number).includes(weekDayOf(date));

/** Faces read as entered by the teacher, in quarters, within the plan limits. */
export function normalizeReadingFaces(value, fallback = DEFAULT_PLAN_READING_FACES) {
  const faces = Number(value);
  if (!Number.isFinite(faces) || faces <= 0) return Number(fallback) > 0 ? Number(fallback) : DEFAULT_PLAN_READING_FACES;
  return Math.min(MAX_PLAN_READING_FACES, Math.max(0.25, Math.round(faces * 4) / 4));
}

const studentReadingSql = `
  SELECT s.id AS studentId, s.name AS studentName, c.name AS committeeName,
    (SELECT p.reading_faces FROM student_quran_plans p WHERE p.student_id = s.id AND ${currentQuranPlanSql('p')}
     ORDER BY p.id DESC LIMIT 1) AS planFaces,
    g.passed AS passed,
    JSON_UNQUOTE(JSON_EXTRACT(g.detail_json, '$.requiredFaces')) AS recordedFaces
  FROM students s
  JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
  LEFT JOIN committees c ON c.id = s.committee_id
  LEFT JOIN student_daily_grades g ON g.student_id = s.id AND g.grade_date = ? AND g.component = 'reading'`;

const serializeReading = (row) => ({
  studentId: Number(row.studentId),
  studentName: row.studentName,
  committeeName: row.committeeName || '',
  faces: normalizeReadingFaces(row.planFaces),
  status: row.passed == null ? null : (Number(row.passed) === 1 ? 'read' : 'missed'),
  recordedFaces: row.recordedFaces == null ? null : Number(row.recordedFaces),
});

/** The teacher's students with their self reading for the day, or none when it is not a reading day. */
export async function loadTeacherReading(connection, { supervisorId, date }) {
  const policy = await loadGradingPolicyForDate(connection, date, { freeze: false });
  if (!isReadingDay(policy, date)) return { readingDay: false, students: [] };
  const [rows] = await connection.query(`${studentReadingSql} ORDER BY c.name, s.name`, [supervisorId, date]);
  return { readingDay: true, students: rows.map(serializeReading) };
}

/**
 * Records (or clears, with `completed: null`) one student's self reading for the day.
 * Returns null when the student is outside the teacher's circles.
 */
export async function saveTeacherReading(connection, { supervisorId, studentId, date, completed, faces, actor }) {
  const [[row]] = await connection.query(`${studentReadingSql} WHERE s.id = ? LIMIT 1`, [supervisorId, date, studentId]);
  if (!row) return null;
  await assertGradeDate(connection, studentId, date);
  const policy = await loadGradingPolicyForDate(connection, date, { freeze: false });
  if (!isReadingDay(policy, date)) {
    throw Object.assign(new Error('لا توجد قراءة ذاتية في هذا اليوم.'), { status: 422 });
  }
  if (completed === null) {
    await deleteDailyGrade(connection, { studentId, date, component: 'reading', actor });
  } else {
    await recordReadingGrade(connection, {
      studentId,
      date,
      completed: completed === true,
      requiredFaces: normalizeReadingFaces(faces, row.planFaces),
      expectedFaces: normalizeReadingFaces(row.planFaces),
      actor,
    });
  }
  const [[saved]] = await connection.query(`${studentReadingSql} WHERE s.id = ? LIMIT 1`, [supervisorId, date, studentId]);
  return serializeReading(saved);
}
