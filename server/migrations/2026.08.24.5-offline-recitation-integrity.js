export const version = '2026.08.24.5';

async function columnExists(connection, table, column) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Number(row.count) > 0;
}

async function indexExists(connection, table, index) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, index],
  );
  return Number(row.count) > 0;
}

export async function up(connection) {
  if (!(await columnExists(connection, 'student_quran_recitation_submissions', 'session_type'))) {
    await connection.query(
      `ALTER TABLE student_quran_recitation_submissions
       ADD COLUMN session_type VARCHAR(40) NOT NULL DEFAULT 'general' AFTER session_date`,
    );
  }
  if (!(await columnExists(connection, 'student_quran_recitation_daily_slots', 'session_type'))) {
    await connection.query(
      `ALTER TABLE student_quran_recitation_daily_slots
       ADD COLUMN session_type VARCHAR(40) NOT NULL DEFAULT 'general' AFTER session_date`,
    );
    await connection.query(
      `ALTER TABLE student_quran_recitation_daily_slots
       DROP PRIMARY KEY, ADD PRIMARY KEY (student_id, session_date, session_type)`,
    );
  }
  if (!(await columnExists(connection, 'student_quran_recitation_submissions', 'current_plan_version'))) {
    await connection.query(
      `ALTER TABLE student_quran_recitation_submissions
       ADD COLUMN current_plan_version INT UNSIGNED NULL AFTER plan_version`,
    );
  }
  if (!(await columnExists(connection, 'student_quran_recitation_attempts', 'session_id'))) {
    await connection.query(
      `ALTER TABLE student_quran_recitation_attempts
       ADD COLUMN session_id CHAR(36) NULL AFTER request_id`,
    );
  }
  if (!(await columnExists(connection, 'student_quran_recitation_attempts', 'is_official'))) {
    await connection.query(
      `ALTER TABLE student_quran_recitation_attempts
       ADD COLUMN is_official TINYINT(1) NOT NULL DEFAULT 1 AFTER session_id`,
    );
  }
  if (!(await indexExists(connection, 'student_quran_recitation_attempts', 'offline_attempt_session_lookup'))) {
    await connection.query(
      `ALTER TABLE student_quran_recitation_attempts
       ADD INDEX offline_attempt_session_lookup (session_id, is_official)`,
    );
  }
  await connection.query(
    `UPDATE student_quran_recitation_attempts
     SET session_id = SUBSTRING_INDEX(request_id, ':', 1)
     WHERE session_id IS NULL AND request_id REGEXP
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}:'`,
  );
}
