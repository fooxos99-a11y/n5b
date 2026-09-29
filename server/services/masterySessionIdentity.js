// Reclassify only legacy sessions whose persisted parts all belong to mastery.
// Caller holds the recitation transaction; grades, attempts and points are untouched.
export async function normalizeMasterySessionIdentity(connection, studentId, sessionDate) {
  await connection.query(`UPDATE student_quran_recitation_daily_slots slot
    JOIN student_quran_recitation_submissions submission ON submission.session_id = slot.session_id
    JOIN (SELECT part.session_id FROM student_quran_recitation_session_parts part
      JOIN student_quran_tasks task ON task.id = part.task_id
      WHERE task.student_id = ?
      GROUP BY part.session_id
      HAVING MIN(task.task_type = 'memorization' AND task.track = 'mastery') = 1
    ) mastery ON mastery.session_id = slot.session_id
    SET slot.session_type = REPLACE(slot.session_type, 'memorization', 'mastery'),
        submission.session_type = REPLACE(submission.session_type, 'memorization', 'mastery')
    WHERE slot.student_id = ? AND slot.session_date = ?
      AND (slot.session_type = 'memorization' OR slot.session_type LIKE 'memorization:%')`, [studentId, studentId, sessionDate]);
}
