export const version = '2026.10.02.5';

export async function up(connection) {
  // Only the former built-in job title changes; names, custom titles and IDs stay intact.
  await connection.query(`UPDATE supervisors SET job_title = ?
    WHERE role = 'supervisor' AND job_title IN (?, ?, ?, ?)`,
  ['مشرف المسار', 'معلم', 'المعلم', 'معلّم', 'المعلّم']);
  // Actions are generated system labels, unlike account names and user-written messages.
  for (const [previous, current] of [['المعلمين', 'مشرفي المسارات'], ['المعلمون', 'مشرفو المسارات'], ['المعلم', 'مشرف المسار'], ['معلم', 'مشرف المسار']]) {
    await connection.query('UPDATE activity_logs SET action = REPLACE(action, ?, ?) WHERE action LIKE ?',
      [previous, current, `%${previous}%`]);
  }
}

export async function down() {
  throw new Error('Restore the database backup to recover the exact prior job titles.');
}
