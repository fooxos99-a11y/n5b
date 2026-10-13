import { studyDateSql } from './seasonalHolidays.js';
import { planScheduleDates } from './planScheduleDates.js';

/** Only weekly-program days count, after all required student outcomes have been recorded. */
export function teacherRecordingCompletion(rows, readingDates = [], workDates = []) {
  const reading = new Set(readingDates), work = new Set(workDates), teachers = new Map();
  for (const row of rows) {
    if (!work.has(row.date)) continue;
    const tasks = Number(row.requiredTasks || 0);
    const requiresReading = reading.has(row.date) && Boolean(Number(row.hasReadingAmount));
    if (!tasks && !requiresReading) continue;
    const key = String(row.teacherId);
    const result = teachers.get(key) || { completed:0, expected:0, percentage:null };
    result.expected += 1;
    if (Number(row.recordedTasks) === tasks && (!requiresReading || Number(row.readingRecorded) === 1)) result.completed += 1;
    result.percentage = Math.round(result.completed / result.expected * 100);
    teachers.set(key, result);
  }
  return teachers;
}

export async function loadTeacherRecordingCompletion(scope, { from, to, attendanceDates, readingDays = [] }) {
  const allDates = [...new Set(attendanceDates)].sort();
  if (!allDates.length) return new Map();
  const work = new Set(allDates);
  const readingDates = readingDays.length
    ? (await planScheduleDates(scope, from, to, readingDays, 'readingDays')).filter(date => work.has(date)) : [];
  const [rows] = await scope.query(`SELECT sc.supervisor_id AS teacherId, s.id AS studentId,
    DATE_FORMAT(ar.record_date,'%Y-%m-%d') AS date,
    COUNT(DISTINCT t.id) AS requiredTasks,
    COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM student_quran_recitation_attempts attempt
      WHERE attempt.task_id=t.id AND attempt.session_date=ar.record_date AND attempt.is_official=1
        AND attempt.evaluator_id=sc.supervisor_id) THEN t.id END) AS recordedTasks,
    MAX(g.id IS NOT NULL AND g.recorded_by_role='supervisor' AND g.recorded_by_id=sc.supervisor_id) AS readingRecorded,
    MAX(COALESCE(p.reading_faces,10)>0 AND (
      EXISTS (SELECT 1 FROM student_quran_prior_memorization prior WHERE prior.student_id=s.id)
      OR EXISTS (SELECT 1 FROM student_quran_plan_prior_memorization prior WHERE prior.student_id=s.id AND prior.plan_id=p.id)
      OR EXISTS (SELECT 1 FROM student_quran_tasks saved WHERE saved.student_id=s.id AND saved.task_type='memorization'
        AND saved.teacher_completed=1 AND saved.task_date<ar.record_date))) AS hasReadingAmount
    FROM supervisor_committees sc JOIN students s ON s.committee_id=sc.committee_id
    JOIN supervisors sp ON sp.id=sc.supervisor_id
    JOIN attendance_records ar ON ar.student_id=s.id AND ar.status IN ('present','late')
    JOIN student_quran_plans p ON p.student_id=s.id AND p.start_date<=ar.record_date AND p.status IN ('active','completed')
      AND p.id=(SELECT MAX(current.id) FROM student_quran_plans current WHERE current.student_id=s.id AND current.start_date<=ar.record_date)
    LEFT JOIN student_quran_tasks t ON t.plan_id=p.id AND t.task_date=ar.record_date
      AND t.task_type IN ('memorization','review','link') AND t.compensation_index=0
    LEFT JOIN student_daily_grades g ON g.student_id=s.id AND g.grade_date=ar.record_date AND g.component='reading'
    WHERE ar.record_date BETWEEN ? AND ? AND DATE(sp.created_at)<=ar.record_date
      AND ar.record_date IN (${allDates.map(() => '?').join(',')})
      AND ${studyDateSql('ar.record_date','s.id')} AND ${scope.staff('sc.supervisor_id')} AND ${scope.student('s.id')}
    GROUP BY sc.supervisor_id,s.id,ar.record_date`, [from,allDates.at(-1),...allDates]);
  return teacherRecordingCompletion(rows, readingDates, attendanceDates);
}
