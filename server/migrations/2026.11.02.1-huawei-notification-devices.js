export const version = '2026.11.02.1';
export const statements = ["ALTER TABLE notification_devices MODIFY platform ENUM('android', 'ios', 'huawei') NOT NULL"];
export async function up(connection) { for (const statement of statements) await connection.query(statement); }
export async function down(connection) {
  const [[row]] = await connection.query("SELECT COUNT(*) AS total FROM notification_devices WHERE platform = 'huawei'");
  if (Number(row.total)) throw new Error('Huawei devices must be retained; refusing to narrow their platform enum.');
  await connection.query("ALTER TABLE notification_devices MODIFY platform ENUM('android', 'ios') NOT NULL");
}
