export const version = '2026.09.28.2';

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS grade_point_reset_keys (
    dedupe_key VARCHAR(190) NOT NULL PRIMARY KEY,
    reset_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

// Keep reset boundaries on rollback: deleting them would resurrect historical points.
export async function down() {}
