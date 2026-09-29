export const version = '2026.08.24.9';

export async function up(connection) {
  await connection.query(`
    INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
      ('memorizationListeningCount', '3'),
      ('masteryListeningCount', '3'),
      ('memorizationRepeatPointValue', '1'),
      ('masteryRepeatPointValue', '1'),
      ('memorizationListeningPointValue', '10'),
      ('masteryListeningPointValue', '10'),
      ('allowListeningCountEditing', 'false')
  `);
}
