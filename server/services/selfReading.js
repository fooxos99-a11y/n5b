import { DEFAULT_PLAN_READING_FACES, MAX_PLAN_READING_FACES } from '../../shared/quran-plan-options.js';
import { assertGradeDate } from './gradeDateBoundary.js';
import { deleteDailyGrade, loadGradingPolicyForDate, recordReadingGrade } from './grading.js';
import { loadSeasonalHolidays } from './seasonalHolidays.js';
import { loadIndividualStudentPlanPauses } from './studentPlanPause.js';
import { isStudentPlanPausedOn } from '../../shared/student-plan-pause.js';
import { isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { currentQuranPlanSql } from './currentQuranPlan.js';
import { loadMemorizedReading } from './selfReadingAmount.js';

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
    (SELECT p.reading_hizbs FROM student_quran_plans p WHERE p.student_id = s.id AND ${currentQuranPlanSql('p')}
     ORDER BY p.id DESC LIMIT 1) AS planHizbs,
    (SELECT IF(p.start_surah > p.end_surah OR (p.start_surah = p.end_surah AND p.start_ayah > p.end_ayah), -1, 1)
     FROM student_quran_plans p WHERE p.student_id = s.id AND ${currentQuranPlanSql('p')} ORDER BY p.id DESC LIMIT 1) AS direction,
    g.passed AS passed,
    g.detail_json AS readingDetail,
    JSON_UNQUOTE(JSON_EXTRACT(g.detail_json, '$.requiredFaces')) AS recordedFaces,
    JSON_UNQUOTE(JSON_EXTRACT(g.detail_json, '$.fromHizb')) AS fromHizb,
    JSON_UNQUOTE(JSON_EXTRACT(g.detail_json, '$.toHizb')) AS toHizb,
    JSON_UNQUOTE(JSON_EXTRACT(g.detail_json, '$.hizbCount')) AS hizbCount
  FROM students s
  JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
  LEFT JOIN committees c ON c.id = s.committee_id
  LEFT JOIN student_daily_grades g ON g.student_id = s.id AND g.grade_date = ? AND g.component = 'reading'`;

const parseDetail = value => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const serializeReading = (row, amount) => ({
  studentId: Number(row.studentId),
  studentName: row.studentName,
  committeeName: row.committeeName || '',
  faces: normalizeReadingFaces(row.planFaces),
  expectedHizbs: row.planHizbs == null ? null : Number(row.planHizbs),
  status: row.passed == null ? null : (Number(row.passed) === 1 ? 'read' : 'missed'),
  recordedFaces: row.recordedFaces == null ? null : Number(row.recordedFaces),
  fromHizb: row.fromHizb == null ? null : Number(row.fromHizb),
  toHizb: row.toHizb == null ? null : Number(row.toHizb),
  hizbCount: row.hizbCount == null ? null : Number(row.hizbCount),
  amount,
});

const amountFor = async (connection, row, date) => {
  const detail = parseDetail(row.readingDetail);
  if (detail?.ranges) return { faces: detail.requiredFaces, ranges: detail.ranges, range: detail.range,
    hizbCount: detail.hizbCount, fromHizb: detail.fromHizb, toHizb: detail.toHizb, cursor: detail.readingCursor };
  return loadMemorizedReading(connection, { studentId: row.studentId, date,
    faces: normalizeReadingFaces(row.planFaces), hizbs: row.planHizbs == null ? null : Number(row.planHizbs),
    direction: Number(row.direction) < 0 ? -1 : 1 });
};

/** The teacher's students with their self reading for the day, or none when it is not a reading day. */
export async function loadTeacherReading(connection, { supervisorId, date }) {
  const policy = await loadGradingPolicyForDate(connection, date, { freeze: false });
  if (isSeasonalHoliday(date, await loadSeasonalHolidays(connection)) || !isReadingDay(policy, date)) return { readingDay: false, students: [] };
  const [rows] = await connection.query(`${studentReadingSql} ORDER BY c.name, s.name`, [supervisorId, date]);
  const pauses = await loadIndividualStudentPlanPauses(connection);
  return { readingDay: true, students: await Promise.all(rows.filter(row => !isStudentPlanPausedOn(date, pauses[row.studentId])).map(async row => serializeReading(row, await amountFor(connection, row, date)))) };
}

/**
 * Records (or clears, with `completed: null`) one student's self reading for the day.
 * Returns null when the student is outside the teacher's circles.
 */
export async function saveTeacherReading(connection, { supervisorId, studentId, date, completed, actor }) {
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
    const readingRange = await amountFor(connection, row, date);
    if (!readingRange.ranges.length || !(readingRange.faces > 0)) {
      throw Object.assign(new Error('لا يوجد محفوظ لتحديد مقدار الذاتي.'), { status: 422 });
    }
    await recordReadingGrade(connection, {
      studentId,
      date,
      completed: completed === true,
      requiredFaces: readingRange.faces,
      expectedFaces: normalizeReadingFaces(row.planFaces),
      expectedHizbs: row.planHizbs == null ? null : Number(row.planHizbs),
      readingRange,
      actor,
    });
  }
  const [[saved]] = await connection.query(`${studentReadingSql} WHERE s.id = ? LIMIT 1`, [supervisorId, date, studentId]);
  return serializeReading(saved, await amountFor(connection, saved, date));
}
