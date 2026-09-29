export const version = '2026.09.22.3';

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS student_balance_adjustments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    delta INT NOT NULL,
    balance_before INT NOT NULL,
    balance_after INT NOT NULL,
    reason VARCHAR(500) NOT NULL,
    actor_role VARCHAR(40) NULL,
    actor_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_balance_student (student_id, created_at),
    CONSTRAINT fk_balance_adjustment_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function down(connection) {
  const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM student_balance_adjustments');
  if (Number(row.count)) throw new Error('Cannot remove student balance adjustment history.');
  await connection.query('DROP TABLE student_balance_adjustments');
}
