export const version = '2026.10.11.1';

export async function up(connection) {
  const [columns] = await connection.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'student_quran_tasks' AND column_name = 'compensated_review_date'`);
  if (!columns.length) await connection.query('ALTER TABLE student_quran_tasks ADD COLUMN compensated_review_date DATE NULL AFTER compensation_days');
}

export async function down(connection) {
  const [rows] = await connection.query('SELECT id FROM student_quran_tasks WHERE compensated_review_date IS NOT NULL LIMIT 1');
  if (rows.length) throw new Error('Cannot remove the review compensation date while recorded compensation tasks exist.');
  await connection.query('ALTER TABLE student_quran_tasks DROP COLUMN compensated_review_date');
}
