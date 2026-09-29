export const version = '2026.08.17.6';

export async function up(connection) {
  await connection.query(`
    ALTER TABLE call_rooms
    MODIFY COLUMN committee_id BIGINT UNSIGNED NULL
  `);
}
