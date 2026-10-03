export const version = '2026.10.02.8';
export async function up(connection) {
  const [columns] = await connection.query('SHOW COLUMNS FROM student_day_compensations');
  if (!columns.some(row => row.Field === 'scope')) {
    await connection.query(`ALTER TABLE student_day_compensations
      ADD scope VARCHAR(16) NOT NULL DEFAULT 'program',
      ADD period_date DATE NULL,
      ADD before_json JSON NULL,
      ADD credited_ranges JSON NULL,
      ADD cancelled_at DATETIME(3) NULL,
      ADD cancelled_by_role VARCHAR(24) NULL,
      ADD cancelled_by_id BIGINT UNSIGNED NULL,
      ADD cancelled_by_name VARCHAR(180) NULL,
      ADD cancellation_reason VARCHAR(500) NULL,
      ADD active_record TINYINT GENERATED ALWAYS AS (IF(cancelled_at IS NULL, 1, NULL)) STORED`);
  }
  await connection.query('UPDATE student_day_compensations SET period_date = compensated_date WHERE period_date IS NULL');
  const [indexes] = await connection.query('SHOW INDEX FROM student_day_compensations');
  if (!indexes.some(row => row.Key_name === 'student_compensation_active_unique')) {
    await connection.query('ALTER TABLE student_day_compensations ADD UNIQUE KEY student_compensation_active_unique (student_id, scope, period_date, active_record)');
  }
  if (indexes.some(row => row.Key_name === 'student_day_compensation_unique')) {
    await connection.query('ALTER TABLE student_day_compensations DROP INDEX student_day_compensation_unique');
  }
  await connection.query(`CREATE TABLE IF NOT EXISTS student_excuse_approvals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    excuse_date DATE NOT NULL,
    reference VARCHAR(500) NOT NULL,
    approved_by_role VARCHAR(24) NOT NULL,
    approved_by_id BIGINT UNSIGNED NOT NULL,
    approved_by_name VARCHAR(180) NOT NULL,
    approved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY student_excuse_date (student_id, excuse_date),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
export async function down() {
  // Approval and correction history is retained.
}
