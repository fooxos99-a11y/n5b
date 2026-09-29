export const version = '2026.09.29.1';

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS narration_event_reciters (
    event_student_id BIGINT UNSIGNED NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    actor_name VARCHAR(255) NOT NULL,
    PRIMARY KEY (event_student_id, actor_role, actor_id),
    CONSTRAINT narration_reciters_entry_fk FOREIGN KEY (event_student_id)
      REFERENCES narration_event_students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[column]] = await connection.query(`SELECT COUNT(*) AS count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'narration_event_parts' AND column_name = 'evaluated_by_name'`);
  if (!Number(column.count)) await connection.query('ALTER TABLE narration_event_parts ADD COLUMN evaluated_by_name VARCHAR(255) NULL');
}
