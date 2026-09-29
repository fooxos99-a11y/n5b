export const version = '2026.08.26.2';

export async function up(connection) {
  await connection.query(
    `INSERT IGNORE INTO app_settings (setting_key, setting_value)
     VALUES ('familyRankingMode', 'total')`,
  );
}

export async function down(connection) {
  await connection.query("DELETE FROM app_settings WHERE setting_key = 'familyRankingMode'");
}
