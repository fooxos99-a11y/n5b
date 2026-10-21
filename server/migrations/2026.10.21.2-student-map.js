import { normalizeSummitMapConfig } from '../../shared/summit-map.js';
export const version = '2026.10.21.2';
export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS student_summit_progress (
    student_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,kilometers INT UNSIGNED NOT NULL DEFAULT 0,
    FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_summit_arrivals (
    student_id BIGINT UNSIGNED NOT NULL,location_id VARCHAR(80) NOT NULL,completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(student_id,location_id),FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query(`CREATE TABLE IF NOT EXISTS student_station_points (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,student_id BIGINT UNSIGNED NOT NULL,station_id VARCHAR(80) NOT NULL,
    earned_points INT UNSIGNED NOT NULL DEFAULT 0,completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY student_station (student_id,station_id),FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await connection.query('INSERT IGNORE INTO app_settings(setting_key,setting_value) VALUES(?,?)',
    ['summitMapSettings', JSON.stringify({ enabled: true, revision: 0, mapConfig: normalizeSummitMapConfig() })]);
}
export async function down(connection) {
  for (const table of ['student_summit_arrivals', 'student_summit_progress', 'student_station_points']) await connection.query(`DROP TABLE IF EXISTS ${table}`);
  await connection.query('DELETE FROM app_settings WHERE setting_key=?', ['summitMapSettings']);
}
