export const version = '2026.09.01.1';

async function columnExists(connection, tableName, columnName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName],
  );
  return Number(row?.count || 0) > 0;
}

async function indexExists(connection, tableName, indexName) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [tableName, indexName],
  );
  return Number(row?.count || 0) > 0;
}

export async function up(connection) {
  await connection.query("DELETE FROM app_settings WHERE setting_key IN ('quranTestRecitationMode', 'narrationRecitationMode')");
  if (!await columnExists(connection, 'student_quran_tests', 'sample_pages_json')) {
    await connection.query('ALTER TABLE student_quran_tests ADD COLUMN sample_pages_json JSON NULL AFTER word_marks_json');
  }
  if (!await columnExists(connection, 'app_notifications', 'dedupe_key')) {
    await connection.query('ALTER TABLE app_notifications ADD COLUMN dedupe_key VARCHAR(220) NULL AFTER body');
  }
  if (!await indexExists(connection, 'app_notifications', 'app_notifications_dedupe_unique')) {
    await connection.query('CREATE UNIQUE INDEX app_notifications_dedupe_unique ON app_notifications (dedupe_key)');
  }
}

export async function down(connection) {
  if (await indexExists(connection, 'app_notifications', 'app_notifications_dedupe_unique')) {
    await connection.query('DROP INDEX app_notifications_dedupe_unique ON app_notifications');
  }
  if (await columnExists(connection, 'app_notifications', 'dedupe_key')) {
    await connection.query('ALTER TABLE app_notifications DROP COLUMN dedupe_key');
  }
  if (await columnExists(connection, 'student_quran_tests', 'sample_pages_json')) {
    await connection.query('ALTER TABLE student_quran_tests DROP COLUMN sample_pages_json');
  }
  await connection.query(`INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
    ('quranTestRecitationMode', 'count'),
    ('narrationRecitationMode', 'count')`);
}
