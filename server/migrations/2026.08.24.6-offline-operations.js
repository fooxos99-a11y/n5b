export const version = '2026.08.24.6';

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS offline_operation_receipts (
    request_id CHAR(36) NOT NULL PRIMARY KEY,
    actor_role VARCHAR(40) NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    operation_type VARCHAR(60) NOT NULL,
    result_json JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX offline_operation_actor_lookup (actor_role, actor_id, operation_type, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
