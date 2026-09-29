export async function filterPlanMarksByLatestAttempt(connection, marksByTask) {
  const ids = [...marksByTask.keys()];
  if (!ids.length) return marksByTask;
  const [attempts] = await connection.query(`SELECT a.task_id AS taskId,
    (COALESCE(JSON_LENGTH(a.word_marks_json), 0) + COALESCE(JSON_LENGTH(a.ayah_marks_json), 0) > 0) AS hasDetailedMarks
    FROM student_quran_recitation_attempts a
    JOIN (SELECT task_id, MAX(id) AS id FROM student_quran_recitation_attempts
      WHERE task_id IN (?) AND is_official = 1 GROUP BY task_id) latest ON latest.id = a.id`, [ids]);
  for (const attempt of attempts) {
    if (!Number(attempt.hasDetailedMarks)) marksByTask.set(Number(attempt.taskId), []);
  }
  return marksByTask;
}
