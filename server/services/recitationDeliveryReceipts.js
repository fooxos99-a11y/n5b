export async function loadRecitationDeliveryReceipts(connection, teacherId, date) {
  const [rows] = await connection.query(`SELECT a.task_id AS taskId, t.student_id AS studentId,
      s.name AS studentName, t.task_type AS taskType, t.track,
      DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate
    FROM student_quran_recitation_attempts a
    JOIN student_quran_tasks t ON t.id = a.task_id
    JOIN students s ON s.id = t.student_id
    WHERE a.evaluator_id = ? AND a.session_date = ? AND a.is_official = 1
      AND EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id)
    ORDER BY s.name, t.task_date, a.id DESC`, [teacherId, date, teacherId]);
  return rows.map((row) => ({ ...row, status: 'server_saved' }));
}
