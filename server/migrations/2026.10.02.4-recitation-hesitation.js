import { createColumnMigration } from '../services/columnMigration.js';

export const version = '2026.10.02.4';
const columns = [
  ['student_quran_tasks', 'hesitation_count', 'INT NOT NULL DEFAULT 0'],
  ['student_quran_tasks', 'evaluation_hesitation_deduction', 'DECIMAL(7,2) NULL'],
  ['student_quran_recitation_attempts', 'hesitation_count', 'INT NOT NULL DEFAULT 0'],
  ['student_quran_recitation_attempts', 'evaluation_hesitation_deduction', 'DECIMAL(7,2) NULL'],
  ['narration_event_parts', 'hesitation_count', 'INT NOT NULL DEFAULT 0'],
];

export async function up(connection) {
  for (const [tableName, columnName, definition] of columns) {
    await createColumnMigration({ tableName, columnName,
      addSql: `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}` }).up(connection);
  }
  await connection.query("ALTER TABLE student_quran_task_ayah_marks MODIFY COLUMN mark_type ENUM('mistake', 'warning', 'hesitation') NOT NULL");
  await connection.query("ALTER TABLE student_quran_task_word_marks MODIFY COLUMN mark_type ENUM('mistake', 'warning', 'lahn', 'hesitation') NOT NULL");
  await connection.query("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('narrationHesitationDeduction', '0')");
}

export async function down() {
  throw new Error('Restore the database backup to roll back hesitation evaluations without losing recorded counts or marks.');
}
