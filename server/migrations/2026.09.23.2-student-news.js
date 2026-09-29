export const version = '2026.09.23.2';
export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS student_news (
    id TINYINT UNSIGNED PRIMARY KEY,
    revision INT UNSIGNED NOT NULL DEFAULT 0,
    content MEDIUMTEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await connection.query(`INSERT IGNORE INTO student_news (id, content) VALUES (1, '{}')`);
}
export async function down(connection) { await connection.query('DROP TABLE IF EXISTS student_news'); }
