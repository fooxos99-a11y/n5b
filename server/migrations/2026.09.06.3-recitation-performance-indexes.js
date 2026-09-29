export const version = '2026.09.06.3';
const indexes = [
  ['quran_ayah_pages', 'quran_position_traversal_lookup', 'page_number, surah_number, ayah_number'],
  ['student_quran_tasks', 'quran_pending_expiry_lookup', 'student_status, teacher_completed, task_date, id'],
];
async function exists(connection, table, name) {
  const [[row]] = await connection.query(
    'SELECT COUNT(*) AS count FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
    [table, name],
  );
  return Number(row?.count) > 0;
}
export async function up(connection) {
  for (const [table, name, columns] of indexes) {
    if (!await exists(connection, table, name)) await connection.query(`ALTER TABLE ${table} ADD INDEX ${name} (${columns})`);
  }
}
export async function down(connection) {
  for (const [table, name] of [...indexes].reverse()) {
    if (await exists(connection, table, name)) await connection.query(`ALTER TABLE ${table} DROP INDEX ${name}`);
  }
}
