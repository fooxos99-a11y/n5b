export const version = '2026.10.02.6';
export async function up(connection) {
  await connection.query("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('seasonalHolidays', '[]')");
}
export async function down() {
  // Keep the setting and configured dates: older versions safely ignore them.
}
