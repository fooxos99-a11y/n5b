export const version = '2026.09.26.1';

async function addColumn(connection, table, column, definition) {
  const [columns] = await connection.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  if (!columns.length) await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function up(connection) {
  await addColumn(connection, 'student_quran_plans', 'review_hizbs', 'TINYINT UNSIGNED NOT NULL DEFAULT 1');
  await addColumn(connection, 'student_quran_plans', 'reading_faces', 'DECIMAL(6,2) NULL');
  await addColumn(connection, 'student_quran_tasks', 'hizb_number', 'TINYINT UNSIGNED NULL');

  await connection.query(`CREATE TABLE IF NOT EXISTS grading_week_policies (
    week_start DATE NOT NULL PRIMARY KEY,
    policy_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS student_daily_grades (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    grade_date DATE NOT NULL,
    component ENUM('attendance', 'memorization', 'link', 'review', 'reading') NOT NULL,
    grade DECIMAL(9,4) NOT NULL DEFAULT 0,
    max_grade DECIMAL(9,4) NOT NULL DEFAULT 0,
    passed TINYINT(1) NOT NULL DEFAULT 0,
    manual_fail TINYINT(1) NOT NULL DEFAULT 0,
    fail_type VARCHAR(20) NULL,
    fail_reason VARCHAR(160) NULL,
    repeat_required TINYINT(1) NOT NULL DEFAULT 0,
    detail_json TEXT NULL,
    policy_json TEXT NOT NULL,
    recorded_by_role VARCHAR(20) NULL,
    recorded_by_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY student_daily_grades_unique (student_id, grade_date, component),
    KEY student_daily_grades_date (grade_date),
    CONSTRAINT student_daily_grades_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await connection.query(`CREATE TABLE IF NOT EXISTS student_weekly_components (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    week_start DATE NOT NULL,
    component ENUM('track', 'weekly') NOT NULL,
    attended TINYINT(1) NOT NULL DEFAULT 0,
    grade DECIMAL(9,4) NOT NULL DEFAULT 0,
    max_grade DECIMAL(9,4) NOT NULL DEFAULT 0,
    detail_json TEXT NULL,
    policy_json TEXT NOT NULL,
    recorded_by_role VARCHAR(20) NULL,
    recorded_by_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY student_weekly_components_unique (student_id, week_start, component),
    CONSTRAINT student_weekly_components_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS student_weekly_components');
  await connection.query('DROP TABLE IF EXISTS student_daily_grades');
  await connection.query('DROP TABLE IF EXISTS grading_week_policies');
  await connection.query('ALTER TABLE student_quran_tasks DROP COLUMN hizb_number');
  await connection.query('ALTER TABLE student_quran_plans DROP COLUMN reading_faces');
  await connection.query('ALTER TABLE student_quran_plans DROP COLUMN review_hizbs');
}
