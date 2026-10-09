import { assertStudyDate } from './seasonalHolidays.js';
import { syncStudentFamilyPointsForAttendance } from './studentPoints.js';
import { recordAttendanceGrade } from './grading.js';

// Caller owns the transaction. Lock the student first to serialize changes for the same day.
// Attendance earns points only through its attendance grade.
export async function saveStudentAttendance(connection, {
  studentId, date, status, checkInTime = null, actorRole = 'system', actorName = 'النظام', actorId = null,
}, settings) {
  await assertStudyDate(connection, date, studentId);
  await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
  const [[previous]] = await connection.query(
    'SELECT status FROM attendance_records WHERE student_id = ? AND record_date = ? FOR UPDATE', [studentId, date],
  );
  await connection.query(`INSERT INTO attendance_records (student_id, record_date, status, check_in_time, points)
    VALUES (?, ?, ?, ?, 0) ON DUPLICATE KEY UPDATE status = VALUES(status),
    check_in_time = VALUES(check_in_time), points = 0`, [studentId, date, status, checkInTime]);
  await syncStudentFamilyPointsForAttendance(connection, studentId, date, status, settings, { actorRole, actorName });
  await recordAttendanceGrade(connection, { studentId, date, status, actor: { role: actorRole, id: actorId, name: actorName } });
  return { previous: previous || null };
}
