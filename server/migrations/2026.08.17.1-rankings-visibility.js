export const version = '2026.08.17.1';

export async function up(connection) {
  await connection.query(`
    INSERT IGNORE INTO app_settings (setting_key, setting_value)
    SELECT 'studentRankingsVisible', COALESCE(
      (SELECT setting_value FROM app_settings WHERE setting_key = 'rankingsVisible' LIMIT 1),
      'true'
    )
  `);
  await connection.query(`
    INSERT IGNORE INTO app_settings (setting_key, setting_value)
    SELECT 'familyRankingsVisible', COALESCE(
      (SELECT setting_value FROM app_settings WHERE setting_key = 'rankingsVisible' LIMIT 1),
      'true'
    )
  `);
}
