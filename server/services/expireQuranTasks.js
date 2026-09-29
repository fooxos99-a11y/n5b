// Select candidates without a range lock, then update only their primary keys.
// Recheck the predicates so a concurrent teacher completion always wins.
export async function expireQuranTasks(connection, today) {
  let cursor = 0;
  for (;;) {
    const [rows] = await connection.query(
      `SELECT id FROM student_quran_tasks
       WHERE student_status = 'pending' AND teacher_completed IS NULL
         AND task_date < ? AND id > ? ORDER BY id LIMIT 200`, [today, cursor],
    );
    if (!rows.length) return;
    const ids = rows.map((row) => Number(row.id));
    await connection.query(
      `UPDATE student_quran_tasks SET student_status = 'not_done'
       WHERE id IN (${ids.map(() => '?').join(',')})
         AND student_status = 'pending' AND teacher_completed IS NULL AND task_date < ?`,
      [...ids, today],
    );
    cursor = ids[ids.length - 1];
  }
}
