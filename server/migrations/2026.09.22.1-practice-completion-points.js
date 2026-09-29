export const version = '2026.09.22.1';
const keys = ['memorizationRepeatPointValue', 'masteryRepeatPointValue', 'memorizationListeningPointValue', 'masteryListeningPointValue'];
const backupKey = 'practiceCompletionPointsPreviousSettings';

export async function up(connection) {
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query(`SELECT setting_key, setting_value FROM app_settings
      WHERE setting_key IN (${keys.map(() => '?').join(',')}) FOR UPDATE`, keys);
    await connection.query('INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)', [backupKey, JSON.stringify(rows)]);
    for (const key of keys) await connection.query(`INSERT INTO app_settings (setting_key, setting_value) VALUES (?, '5')
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`, [key]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function down(connection) {
  await connection.beginTransaction();
  try {
    const [[backup]] = await connection.query('SELECT setting_value FROM app_settings WHERE setting_key = ? FOR UPDATE', [backupKey]);
    if (!backup) throw new Error('Practice settings backup is missing');
    const rows = JSON.parse(backup.setting_value);
    for (const key of keys) {
      const prior = rows.find(row => row.setting_key === key);
      if (prior) await connection.query('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?', [prior.setting_value, key]);
      else await connection.query('DELETE FROM app_settings WHERE setting_key = ?', [key]);
    }
    await connection.query('DELETE FROM app_settings WHERE setting_key = ?', [backupKey]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
