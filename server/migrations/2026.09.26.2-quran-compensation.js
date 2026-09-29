export const version = '2026.09.26.2';

// Compensation recitations are real tasks on the session day. compensation_index
// separates them from the day's regular task (0) so the same link range can be
// recited again; compensation_days records missed review days added to a review.
async function uniqueTaskColumns(connection) {
  const [rows] = await connection.query(
    `SELECT column_name AS name FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'student_quran_tasks'
       AND index_name = 'student_quran_task_unique'
     ORDER BY seq_in_index`,
  );
  return rows.map((row) => String(row.name || row.NAME || row.COLUMN_NAME));
}

async function rebuildUniqueKey(connection, columns) {
  await connection.query(`ALTER TABLE student_quran_tasks
    DROP INDEX student_quran_task_unique,
    ADD UNIQUE KEY student_quran_task_unique (${columns.join(', ')})`);
}

export async function up(connection) {
  const [columns] = await connection.query(
    `SELECT column_name AS name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'student_quran_tasks'
       AND column_name IN ('compensation_index', 'compensation_days')`,
  );
  const existing = new Set(columns.map((column) => String(column.name || column.NAME || column.COLUMN_NAME)));
  if (!existing.has('compensation_index')) {
    await connection.query(`ALTER TABLE student_quran_tasks
      ADD COLUMN compensation_index TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER track`);
  }
  if (!existing.has('compensation_days')) {
    await connection.query(`ALTER TABLE student_quran_tasks
      ADD COLUMN compensation_days SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER compensation_index`);
  }
  const unique = await uniqueTaskColumns(connection);
  if (!unique.includes('compensation_index')) {
    await rebuildUniqueKey(connection, [...unique, 'compensation_index']);
  }
}

export async function down(connection) {
  const [compensations] = await connection.query(
    'SELECT 1 FROM student_quran_tasks WHERE compensation_index > 0 LIMIT 1',
  );
  if (compensations.length) {
    throw new Error('Cannot roll back compensation tasks without discarding recitation data. Restore the verified backup instead.');
  }
  const unique = await uniqueTaskColumns(connection);
  await rebuildUniqueKey(connection, unique.filter((column) => column !== 'compensation_index'));
  await connection.query(`ALTER TABLE student_quran_tasks
    DROP COLUMN compensation_days,
    DROP COLUMN compensation_index`);
}
