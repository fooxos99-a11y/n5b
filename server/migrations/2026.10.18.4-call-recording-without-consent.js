export const version = '2026.10.18.4';

export async function up(connection) {
  // Preserve historical approvals; new participants must not receive a fabricated one.
  await connection.query('ALTER TABLE call_archive_participants MODIFY consented_at DATETIME(3) NULL DEFAULT NULL');
}
