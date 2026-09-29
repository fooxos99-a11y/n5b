export const version = '2026.08.17.2';

export async function up(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS cultural_game_sessions (
      id VARCHAR(80) NOT NULL PRIMARY KEY,
      game_type VARCHAR(40) NOT NULL,
      state_json LONGTEXT NOT NULL,
      control_token_hash CHAR(64) NOT NULL,
      created_by_role VARCHAR(30) NOT NULL,
      created_by_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      INDEX cultural_game_sessions_expiry (expires_at),
      INDEX cultural_game_sessions_type (game_type, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS cultural_game_used_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      game_type VARCHAR(40) NOT NULL,
      question_id VARCHAR(120) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY cultural_game_used_question_unique (game_type, question_id),
      INDEX cultural_game_used_question_type (game_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS cultural_game_question_banks (
      game_type VARCHAR(40) NOT NULL PRIMARY KEY,
      bank_json LONGTEXT NOT NULL,
      updated_by_role VARCHAR(30) NOT NULL,
      updated_by_id BIGINT UNSIGNED NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
