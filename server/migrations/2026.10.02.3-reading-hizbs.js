import { createColumnMigration } from '../services/columnMigration.js';
export const version = '2026.10.02.3';
const migration = createColumnMigration({ tableName: 'student_quran_plans', columnName: 'reading_hizbs',
  addSql: 'ALTER TABLE student_quran_plans ADD COLUMN reading_hizbs TINYINT UNSIGNED NULL',
  dropSql: 'ALTER TABLE student_quran_plans DROP COLUMN reading_hizbs' });
export const up = migration.up;
export async function down(connection) {
  const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_plans WHERE reading_hizbs IS NOT NULL');
  if (Number(row.count)) throw new Error('Restore the backup before removing populated reading amounts.');
  await migration.down(connection);
}
