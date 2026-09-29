export const version = '2026.08.27.1';

export async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      sender_role VARCHAR(40) NULL,
      sender_id BIGINT UNSIGNED NULL,
      sender_name VARCHAR(180) NOT NULL,
      subject TEXT NOT NULL,
      status ENUM('pending', 'replied') NOT NULL DEFAULT 'pending',
      reply TEXT NULL,
      replied_by_role VARCHAR(40) NULL,
      replied_by_id BIGINT UNSIGNED NULL,
      replied_by_name VARCHAR(180) NULL,
      replied_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX contact_messages_status_lookup (status, created_at),
      INDEX contact_messages_sender_lookup (sender_role, sender_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS contact_messages');
}
