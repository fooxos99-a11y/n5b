export async function assertCommitteeNameAvailable(connection, name, excludeId = 0) {
  if (!name || name.length > 160) throw Object.assign(new Error('اسم الحلقة مطلوب وبحد أقصى 160 حرفًا.'), {status:422});
  const [[existing]] = await connection.query('SELECT id FROM committees WHERE name = ? AND id <> ? LIMIT 1 FOR UPDATE', [name, Number(excludeId)]);
  if (existing) throw Object.assign(new Error('يوجد حلقة بهذا الاسم.'), {status:409});
}

/** Move each student's contribution with their current circle; leave independent circle points intact. */
export async function transferStudentCommittee(connection, studentId, committeeId, settings) {
  const [[student]] = await connection.query('SELECT committee_id AS committeeId FROM students WHERE id = ? FOR UPDATE', [studentId]);
  if (!student) throw Object.assign(new Error('الطالب غير موجود.'), {status:404});
  await connection.query('UPDATE students SET committee_id = ? WHERE id = ?', [committeeId, studentId]);
  if (!settings.studentPointsAddToFamily || Number(student.committeeId) === Number(committeeId)) return;
  const ids = [...new Set([student.committeeId, committeeId].filter(Boolean).map(Number))].sort((a,b) => a-b);
  for (const id of ids) {
    await connection.query('SELECT id FROM committees WHERE id = ? FOR UPDATE', [id]);
    const [[total]] = await connection.query('SELECT COALESCE(SUM(points),0) AS points FROM students WHERE committee_id = ?', [id]);
    await connection.query('UPDATE committees SET points = GREATEST(0, points - student_points_contribution + ?), student_points_contribution = ? WHERE id = ?', [total.points, total.points, id]);
  }
}
