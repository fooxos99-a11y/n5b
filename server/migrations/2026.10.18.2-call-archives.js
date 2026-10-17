export const version = '2026.10.18.2';

export async function up(connection) {
  // Deliberately no foreign keys to rooms, committees or accounts: historical
  // snapshots must remain readable after their source records are removed.
  const tables = [
    `CREATE TABLE IF NOT EXISTS call_archive_consents (
      room_id BIGINT UNSIGNED NOT NULL, identity VARCHAR(80) NOT NULL,
      consent_version VARCHAR(30) NOT NULL, consented_at DATETIME(3) NOT NULL,
      PRIMARY KEY (room_id, identity)
    )`,
    `CREATE TABLE IF NOT EXISTS call_archive_sessions (
      id CHAR(36) PRIMARY KEY, room_id BIGINT UNSIGNED NOT NULL,
      active_room_id BIGINT UNSIGNED NULL UNIQUE, livekit_room_name VARCHAR(180) NOT NULL,
      room_name VARCHAR(180) NOT NULL, committee_name VARCHAR(180) NULL,
      owner_role VARCHAR(24) NOT NULL, owner_id BIGINT UNSIGNED NULL,
      state VARCHAR(24) NOT NULL DEFAULT 'starting', report_state VARCHAR(24) NOT NULL DEFAULT 'pending',
      started_at DATETIME(3) NOT NULL, ended_at DATETIME(3) NULL,
      recording_ready_at DATETIME(3) NULL, empty_since DATETIME(3) NULL,
      recording_gap TINYINT NOT NULL DEFAULT 0, last_error VARCHAR(500) NULL,
      transcript_json LONGTEXT NULL, report_json LONGTEXT NULL, review_json LONGTEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX call_archive_room (room_id, started_at), INDEX call_archive_active (active_room_id)
    )`,
    `CREATE TABLE IF NOT EXISTS call_archive_participants (
      session_id CHAR(36) NOT NULL, identity VARCHAR(80) NOT NULL,
      user_role VARCHAR(24) NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
      user_name VARCHAR(180) NOT NULL, consented_at DATETIME(3) NOT NULL,
      joined_at DATETIME(3) NOT NULL, left_at DATETIME(3) NULL,
      PRIMARY KEY (session_id, identity)
    )`,
    `CREATE TABLE IF NOT EXISTS call_archive_media (
      id CHAR(36) PRIMARY KEY, session_id CHAR(36) NOT NULL,
      kind VARCHAR(24) NOT NULL, identity VARCHAR(80) NOT NULL DEFAULT '',
      track_id VARCHAR(100) NOT NULL DEFAULT '', object_key VARCHAR(500) NOT NULL UNIQUE,
      storage VARCHAR(10) NOT NULL, egress_id VARCHAR(120) NULL UNIQUE,
      state VARCHAR(24) NOT NULL DEFAULT 'pending', mime VARCHAR(80) NOT NULL DEFAULT 'audio/mp4',
      bytes BIGINT UNSIGNED NULL, duration_seconds DECIMAL(12,3) NULL,
      started_at DATETIME(3) NULL, ended_at DATETIME(3) NULL,
      last_error VARCHAR(500) NULL,
      UNIQUE KEY call_archive_track (session_id, kind, identity, track_id),
      INDEX call_archive_media_session (session_id)
    )`,
    `CREATE TABLE IF NOT EXISTS call_archive_jobs (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, session_id CHAR(36) NOT NULL,
      kind VARCHAR(24) NOT NULL, state VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0, next_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      lease_until DATETIME(3) NULL, lease_token CHAR(36) NULL,
      last_error VARCHAR(500) NULL,
      UNIQUE KEY call_archive_job (session_id, kind), INDEX call_archive_job_due (state, next_at)
    )`,
    `CREATE TABLE IF NOT EXISTS call_archive_playback_grants (
      token_hash CHAR(64) PRIMARY KEY, session_id CHAR(36) NOT NULL,
      media_id CHAR(36) NOT NULL, actor_role VARCHAR(24) NOT NULL,
      actor_id BIGINT UNSIGNED NOT NULL, auth_token_hash VARCHAR(128) NULL,
      expires_at DATETIME(3) NOT NULL,
      INDEX call_archive_grants_expiry (expires_at)
    )`,
  ];
  for (const sql of tables) await connection.query(`${sql} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function down(connection) {
  const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM call_archive_sessions');
  if (Number(row.count)) throw new Error('Archive data exists; export and preserve it before rolling back.');
  for (const table of ['call_archive_playback_grants', 'call_archive_jobs', 'call_archive_media', 'call_archive_participants', 'call_archive_consents', 'call_archive_sessions']) {
    await connection.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
