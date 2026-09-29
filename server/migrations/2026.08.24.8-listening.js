export const version = '2026.08.24.8';

export async function up(connection) {
  const [columns] = await connection.query(`
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'student_quran_tasks'
      AND COLUMN_NAME = 'actual_listening_count'
    LIMIT 1
  `);
  if (columns.length === 0) {
    await connection.query(`
      ALTER TABLE student_quran_tasks
      ADD COLUMN actual_listening_count INT NULL AFTER actual_repeat_count
    `);
  }
}
