export async function loadStudentRecitationHistory(connection, auth, studentId, buildReport) {
  const id = Number(studentId);
  if (auth?.role !== 'supervisor') throw Object.assign(new Error('سجل التسميع متاح لمعلم الحلقة فقط.'), { statusCode: 403 });
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('الطالب غير صالح.'), { statusCode: 422 });
  const [[student]] = await connection.query(`SELECT s.id, MIN(DATE_FORMAT(a.session_date, '%Y-%m-%d')) AS firstDate
    FROM students s JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
    LEFT JOIN student_quran_tasks t ON t.student_id = s.id
    LEFT JOIN student_quran_recitation_attempts a ON a.task_id = t.id AND a.is_official = 1
    WHERE s.id = ? GROUP BY s.id`, [auth.id, id]);
  if (!student) throw Object.assign(new Error('الطالب غير موجود في حلقاتك.'), { statusCode: 404 });
  if (!student.firstDate) return { rows: [] };
  return buildReport({ from: student.firstDate, studentId: id, studentHistory: true, auth });
}
