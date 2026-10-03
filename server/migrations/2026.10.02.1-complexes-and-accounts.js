import { createColumnMigration } from '../services/columnMigration.js';

export const version = '2026.10.02.1';

const columns = [
  { tableName: 'committees', columnName: 'complex_id', addSql: 'ALTER TABLE committees ADD COLUMN complex_id BIGINT UNSIGNED NULL, ADD INDEX committees_complex_lookup (complex_id), ADD CONSTRAINT committees_complex_fk FOREIGN KEY (complex_id) REFERENCES complexes(id) ON UPDATE CASCADE ON DELETE RESTRICT', dropSql: 'ALTER TABLE committees DROP FOREIGN KEY committees_complex_fk, DROP INDEX committees_complex_lookup, DROP COLUMN complex_id' },
  { tableName: 'students', columnName: 'phone', addSql: 'ALTER TABLE students ADD COLUMN phone VARCHAR(40) NULL', dropSql: 'ALTER TABLE students DROP COLUMN phone' },
  { tableName: 'supervisors', columnName: 'password_hash', addSql: 'ALTER TABLE supervisors ADD COLUMN password_hash VARCHAR(255) NULL', dropSql: 'ALTER TABLE supervisors DROP COLUMN password_hash' },
].map(createColumnMigration);

export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS complexes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for (const column of columns) await column.up(connection);
}

export async function down(connection) {
  // A populated hierarchy must be restored from its backup, never silently discarded.
  const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM complexes');
  if (Number(row.count)) throw new Error('Restore the backup before rolling back populated complexes.');
  for (const column of [...columns].reverse()) await column.down(connection);
  await connection.query('DROP TABLE complexes');
}
