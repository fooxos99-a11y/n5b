import { createColumnMigration } from '../services/columnMigration.js';

export const version = '2026.10.02.2';
const migrations = [
  createColumnMigration({ tableName: 'student_quran_plans', columnName: 'queued_ranges_json', addSql: 'ALTER TABLE student_quran_plans ADD COLUMN queued_ranges_json JSON NULL', dropSql: 'ALTER TABLE student_quran_plans DROP COLUMN queued_ranges_json' }),
  createColumnMigration({ tableName: 'student_quran_plans', columnName: 'queue_parent_id', addSql: 'ALTER TABLE student_quran_plans ADD COLUMN queue_parent_id BIGINT UNSIGNED NULL, ADD UNIQUE INDEX plan_queue_parent_unique (queue_parent_id)', dropSql: 'ALTER TABLE student_quran_plans DROP INDEX plan_queue_parent_unique, DROP COLUMN queue_parent_id' }),
];
export async function up(connection) { for (const migration of migrations) await migration.up(connection); }
export async function down(connection) {
  const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_plans WHERE queue_parent_id IS NOT NULL OR JSON_LENGTH(queued_ranges_json) > 0');
  if (Number(row.count)) throw new Error('Restore the backup before removing populated plan queues.');
  for (const migration of [...migrations].reverse()) await migration.down(connection);
}
