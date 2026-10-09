export const version = '2026.10.09.1';
export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS student_plan_pauses (
    student_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    state_json TEXT NOT NULL,
    CONSTRAINT student_plan_pauses_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_passing_exams (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    exam_type ENUM('branch','hafiz') NOT NULL,
    created_by_role VARCHAR(20) NOT NULL,
    created_by_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY passing_exams_student (student_id, exam_type),
    CONSTRAINT passing_exams_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_passing_parts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    exam_id BIGINT UNSIGNED NOT NULL,
    juz_number TINYINT UNSIGNED NOT NULL,
    ranges_json TEXT NOT NULL,
    UNIQUE KEY passing_parts_juz (exam_id, juz_number),
    CONSTRAINT passing_parts_exam_fk FOREIGN KEY (exam_id) REFERENCES student_passing_exams(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_passing_attempts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    part_id BIGINT UNSIGNED NOT NULL,
    request_id VARCHAR(100) NOT NULL,
    evaluation_mode ENUM('count','mushaf') NOT NULL,
    result_json TEXT NOT NULL,
    policy_json TEXT NOT NULL,
    marks_json MEDIUMTEXT NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    actor_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY passing_attempt_request (part_id, request_id),
    CONSTRAINT passing_attempts_part_fk FOREIGN KEY (part_id) REFERENCES student_passing_parts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
export async function down(connection) {
  for (const table of ['student_passing_attempts', 'student_passing_parts', 'student_passing_exams', 'student_plan_pauses']) await connection.query(`DROP TABLE IF EXISTS ${table}`);
}
