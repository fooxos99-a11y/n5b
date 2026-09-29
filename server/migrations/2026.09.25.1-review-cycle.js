export const version = '2026.09.25.1';
export async function up(connection) {
  const [columns] = await connection.query("SHOW COLUMNS FROM student_quran_tasks LIKE 'review_execution_json'");
  if (!columns.length) await connection.query('ALTER TABLE student_quran_tasks ADD COLUMN review_execution_json JSON NULL');
}
export async function down(connection) {
  await connection.query('ALTER TABLE student_quran_tasks DROP COLUMN review_execution_json');
}
