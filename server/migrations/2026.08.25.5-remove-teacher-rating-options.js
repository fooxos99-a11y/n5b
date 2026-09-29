export const version = '2026.08.25.5';

export async function up(connection) {
  await connection.query("DELETE FROM app_settings WHERE setting_key = 'teacherRatingOptions'");
}
