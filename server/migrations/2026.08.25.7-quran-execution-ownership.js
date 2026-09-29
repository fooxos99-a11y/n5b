export const version = '2026.08.25.7';

export async function up(connection) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_quran_tasks'`,
  );
  const names = new Set(columns.map((column) => column.name));
  if (!names.has('execution_actor_role')) {
    await connection.query(
      "ALTER TABLE student_quran_tasks ADD COLUMN execution_actor_role ENUM('student','teacher') NULL AFTER execution_state",
    );
  }
  if (!names.has('execution_actor_id')) {
    await connection.query(
      'ALTER TABLE student_quran_tasks ADD COLUMN execution_actor_id BIGINT UNSIGNED NULL AFTER execution_actor_role',
    );
  }
  if (!names.has('executed_at')) {
    await connection.query(
      'ALTER TABLE student_quran_tasks ADD COLUMN executed_at DATETIME(3) NULL AFTER execution_actor_id',
    );
  }
}

export async function down(connection) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME AS name
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_quran_tasks'`,
  );
  const names = new Set(columns.map((column) => column.name));
  if (names.has('executed_at')) await connection.query('ALTER TABLE student_quran_tasks DROP COLUMN executed_at');
  if (names.has('execution_actor_id')) await connection.query('ALTER TABLE student_quran_tasks DROP COLUMN execution_actor_id');
  if (names.has('execution_actor_role')) await connection.query('ALTER TABLE student_quran_tasks DROP COLUMN execution_actor_role');
}
