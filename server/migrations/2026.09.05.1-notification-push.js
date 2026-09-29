export const version = '2026.09.05.1';
export const statements = [
  `CREATE TABLE IF NOT EXISTS notification_devices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_role VARCHAR(40) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    platform ENUM('android', 'ios') NOT NULL,
    token VARCHAR(1024) NOT NULL,
    session_hash CHAR(64) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX notification_devices_user (user_role, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS notification_push_deliveries (
    notification_id BIGINT UNSIGNED NOT NULL,
    device_id BIGINT UNSIGNED NOT NULL,
    user_role VARCHAR(40) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    error_code VARCHAR(80) NULL,
    PRIMARY KEY (notification_id, device_id),
    INDEX notification_push_pending (status, next_attempt_at),
    FOREIGN KEY (notification_id) REFERENCES app_notifications(id) ON DELETE CASCADE,
    FOREIGN KEY (device_id) REFERENCES notification_devices(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];
export async function up(connection) { for (const sql of statements) await connection.query(sql); }
export async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS notification_push_deliveries');
  await connection.query('DROP TABLE IF EXISTS notification_devices');
}
