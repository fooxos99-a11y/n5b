export const version = '2026.10.09.2';
export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS student_passing_rehifz (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT UNSIGNED NOT NULL,
    plan_id BIGINT UNSIGNED NOT NULL,
    attempt_id BIGINT UNSIGNED NOT NULL,
    juz_number TINYINT UNSIGNED NOT NULL,
    ranges_json TEXT NOT NULL,
    requested_date DATE NOT NULL,
    completed_date DATE NULL,
    status ENUM('pending','completed') NOT NULL DEFAULT 'pending',
    UNIQUE KEY passing_rehifz_attempt (attempt_id),
    KEY passing_rehifz_student (student_id, status),
    CONSTRAINT passing_rehifz_student_fk FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT passing_rehifz_plan_fk FOREIGN KEY (plan_id) REFERENCES student_quran_plans(id) ON DELETE CASCADE,
    CONSTRAINT passing_rehifz_attempt_fk FOREIGN KEY (attempt_id) REFERENCES student_passing_attempts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for (const [table, column, definition] of [
    ['student_passing_attempts', 'rehifz_decision', "ENUM('pending','keep','repeat') NOT NULL DEFAULT 'keep'"],
    ['student_passing_attempts', 'rehifz_id', 'BIGINT UNSIGNED NULL'],
    ['student_quran_tasks', 'passing_rehifz_id', 'BIGINT UNSIGNED NULL'],
  ]) {
    const [rows] = await connection.query('SHOW COLUMNS FROM ?? LIKE ?', [table, column]);
    if (!rows.length) await connection.query(`ALTER TABLE ?? ADD COLUMN ?? ${definition}`, [table, column]);
  }
  // Existing attempts retain their plans; newly recorded attempts require a choice.
  await connection.query("ALTER TABLE student_passing_attempts ALTER COLUMN rehifz_decision SET DEFAULT 'pending'");
  const [indexes] = await connection.query("SHOW INDEX FROM student_quran_tasks WHERE Key_name = 'quran_tasks_rehifz'");
  if (!indexes.length) await connection.query('ALTER TABLE student_quran_tasks ADD INDEX quran_tasks_rehifz (passing_rehifz_id, teacher_completed)');
}
export async function down(connection) {
  await connection.query('ALTER TABLE student_quran_tasks DROP INDEX quran_tasks_rehifz, DROP COLUMN passing_rehifz_id');
  await connection.query('ALTER TABLE student_passing_attempts DROP COLUMN rehifz_decision, DROP COLUMN rehifz_id');
  await connection.query('DROP TABLE IF EXISTS student_passing_rehifz');
}
