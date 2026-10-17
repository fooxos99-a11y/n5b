export const version = '2026.10.18.3';

export async function up(connection) {
  await connection.query("ALTER TABLE auth_sessions MODIFY COLUMN user_role ENUM('manager', 'admin', 'supervisor', 'reciter', 'student', 'teacher') NOT NULL");
}
