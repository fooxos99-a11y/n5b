export const version = '2026.08.26.3';

async function columnExists(connection) {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'app_notification_recipients'
       AND column_name = 'body_override'`,
  );
  return Number(row.count) > 0;
}

export async function up(connection) {
  if (!await columnExists(connection)) {
    await connection.query(
      'ALTER TABLE app_notification_recipients ADD COLUMN body_override TEXT NULL AFTER user_id',
    );
  }
}

export async function down(connection) {
  if (await columnExists(connection)) {
    await connection.query('ALTER TABLE app_notification_recipients DROP COLUMN body_override');
  }
}
