export const version = '2026.10.02.7';
export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS student_day_compensations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    compensated_date DATE NOT NULL,
    actor_role VARCHAR(24) NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    actor_name VARCHAR(180) NOT NULL,
    excuse_reference VARCHAR(500) NOT NULL,
    attendance_status VARCHAR(24) NULL,
    credited_components JSON NOT NULL,
    recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY student_day_compensation_unique (student_id, compensated_date),
    CONSTRAINT student_day_compensation_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
export async function down() {
  // Retain the audit history; older versions safely ignore this table.
}
