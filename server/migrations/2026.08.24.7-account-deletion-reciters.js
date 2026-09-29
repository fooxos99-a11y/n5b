export const version = '2026.08.24.7';

export async function up(connection) {
  await connection.query(`
    ALTER TABLE account_deletion_requests
    MODIFY COLUMN user_role ENUM('student', 'supervisor', 'admin', 'reciter', 'manager') NOT NULL
  `);
}
