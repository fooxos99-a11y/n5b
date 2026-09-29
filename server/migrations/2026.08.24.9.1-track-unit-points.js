export const version = '2026.08.24.9.1';

export async function up(connection) {
  await connection.query(`
    INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
      ('memorizationRepeatPointValue', '1'),
      ('masteryRepeatPointValue', '1'),
      ('memorizationListeningPointValue', '10'),
      ('masteryListeningPointValue', '10')
  `);
}
