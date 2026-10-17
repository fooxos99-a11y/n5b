export const version = '2026.10.18.1';

export async function up(connection) {
  await connection.query("ALTER TABLE call_rooms MODIFY COLUMN created_by_role ENUM('manager', 'admin', 'supervisor', 'reciter') NOT NULL");
  await connection.query("ALTER TABLE call_room_participants MODIFY COLUMN user_role ENUM('manager', 'admin', 'supervisor', 'student', 'reciter') NOT NULL");
  // Former reciter accounts were disabled. Reopening the role must not revive their old grants or sessions.
  await connection.query("DELETE p FROM supervisor_dashboard_permissions p JOIN supervisors s ON s.id = p.supervisor_id WHERE s.role = 'reciter'");
  await connection.query("DELETE FROM auth_sessions WHERE user_role = 'reciter'");
}
