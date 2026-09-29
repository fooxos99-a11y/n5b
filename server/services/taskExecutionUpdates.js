const BATCH_SIZE = 100;
const UPDATE_COLUMNS = Object.freeze({
  student_status: 'status',
  actual_to_page: 'page',
  actual_to_surah: 'surah',
  actual_to_ayah: 'ayah',
  execution_state: 'executionState',
});

/** Persist execution ranges in bounded batches on the caller's transaction connection. */
export async function persistTaskExecutionUpdates(connection, updates, studentId) {
  for (let offset = 0; offset < updates.length; offset += BATCH_SIZE) {
    const batch = updates.slice(offset, offset + BATCH_SIZE);
    const values = [];
    const assignments = Object.entries(UPDATE_COLUMNS).map(([column, property]) => {
      const cases = batch.map((row) => {
        values.push(row.id, row[property]);
        return 'WHEN ? THEN ?';
      }).join(' ');
      return `${column} = CASE id ${cases} ELSE ${column} END`;
    });
    values.push(studentId, ...batch.map((row) => row.id), studentId);
    // Column names come only from UPDATE_COLUMNS; all IDs and data are bound values.
    // Recheck ownership and teacher locks even though the caller already locked its task group.
    await connection.query(
      `UPDATE student_quran_tasks SET ${assignments.join(', ')},
         execution_actor_role = 'student', execution_actor_id = ?, executed_at = NOW(3)
       WHERE id IN (${batch.map(() => '?').join(',')}) AND student_id = ?
         AND teacher_completed IS NULL
         AND (execution_actor_role IS NULL OR execution_actor_role = 'student')`,
      values,
    );
  }
}
