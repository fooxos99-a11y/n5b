export const version = '2026.08.17.5';

async function addColumnIfMissing(connection, columnName, definition) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'supervisor_attendance_records'
        AND column_name = ?
      LIMIT 1`,
    [columnName],
  );
  if (rows.length > 0) return;

  await connection.query(
    `ALTER TABLE supervisor_attendance_records ADD COLUMN \`${columnName}\` ${definition}`,
  );
}

export async function up(connection) {
  await connection.query(`
    INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES
      ('staffAttendanceSource', 'supervisor'),
      ('staffAttendanceLocationUrl', ''),
      ('staffAttendanceLocationLat', ''),
      ('staffAttendanceLocationLng', ''),
      ('staffAttendanceLateAfterAsrMinutes', '50')
  `);
  await addColumnIfMissing(
    connection,
    'check_in_method',
    "ENUM('manual', 'self') NOT NULL DEFAULT 'manual' AFTER check_in_time",
  );
  await addColumnIfMissing(
    connection,
    'distance_meters',
    'INT UNSIGNED NULL AFTER check_in_method',
  );
  await addColumnIfMissing(connection, 'asr_time', 'TIME NULL AFTER distance_meters');
}
