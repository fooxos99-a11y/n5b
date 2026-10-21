export const version = '2026.10.21.1';
export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS passing_guest_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE,
    link_hash CHAR(64) NOT NULL,
    reciter_name VARCHAR(160) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY passing_guest_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [columns] = await connection.query("SHOW COLUMNS FROM app_notifications LIKE 'action_json'");
  if (!columns.length) await connection.query('ALTER TABLE app_notifications ADD COLUMN action_json TEXT NULL');
}
export async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS passing_guest_sessions');
  await connection.query('ALTER TABLE app_notifications DROP COLUMN action_json');
}
