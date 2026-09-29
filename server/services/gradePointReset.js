/** Snapshot grade identities before resetting their ledger. The caller owns the reset transaction. */
export async function rememberResetGradeKeys(connection) {
  await connection.query(`INSERT IGNORE INTO grade_point_reset_keys (dedupe_key)
    SELECT CONCAT('grade:daily:', student_id, ':', DATE_FORMAT(grade_date, '%Y-%m-%d'), ':', component) FROM student_daily_grades`);
  await connection.query(`INSERT IGNORE INTO grade_point_reset_keys (dedupe_key)
    SELECT CONCAT('grade:weekly:', student_id, ':', DATE_FORMAT(week_start, '%Y-%m-%d'), ':', component) FROM student_weekly_components`);
  await connection.query(`INSERT IGNORE INTO grade_point_reset_keys (dedupe_key)
    SELECT CONCAT('grade:narration:', id) FROM narration_event_students WHERE final_score IS NOT NULL`);
}

export async function gradePointsWereReset(connection, dedupeKey, date) {
  const [[row]] = await connection.query(`SELECT
    EXISTS(SELECT 1 FROM grade_point_reset_keys WHERE dedupe_key = ?) AS resetKey,
    (SELECT setting_value FROM app_settings WHERE setting_key = 'gradePointsResetDate') AS resetDate`, [dedupeKey]);
  // A new weekly result can belong to the week containing the reset. Existing
  // results in that week are protected independently by their snapshotted keys.
  const periodEnd = dedupeKey.startsWith('grade:weekly:')
    ? new Date(Date.parse(`${date}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10)
    : date;
  return Boolean(Number(row?.resetKey)) || Boolean(row?.resetDate && periodEnd < row.resetDate);
}
