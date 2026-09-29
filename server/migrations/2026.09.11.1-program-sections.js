export const version = '2026.09.11.1';
export async function up(connection) {
  const [columns] = await connection.query("SHOW COLUMNS FROM learning_paths LIKE 'parent_path_id'");
  if (!columns.length) await connection.query('ALTER TABLE learning_paths ADD COLUMN parent_path_id BIGINT UNSIGNED NULL, ADD INDEX learning_paths_parent (parent_path_id)');
  const [constraints] = await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'learning_paths' AND CONSTRAINT_NAME = 'learning_paths_parent_fk'");
  if (!constraints.length) await connection.query('ALTER TABLE learning_paths ADD CONSTRAINT learning_paths_parent_fk FOREIGN KEY (parent_path_id) REFERENCES learning_paths(id) ON DELETE RESTRICT');
}
export async function down(connection) {
  const [children] = await connection.query('SELECT id FROM learning_paths WHERE parent_path_id IS NOT NULL LIMIT 1');
  if (children.length) throw new Error('Program sections must be preserved; rollback is blocked while sections exist.');
  await connection.query('ALTER TABLE learning_paths DROP FOREIGN KEY learning_paths_parent_fk, DROP INDEX learning_paths_parent, DROP COLUMN parent_path_id');
}
