import { createColumnMigration } from '../services/columnMigration.js';

export const version = '2026.10.03.1';
const columns = [
  { tableName: 'registration_requests', columnName: 'complex_id', addSql: 'ALTER TABLE registration_requests ADD COLUMN complex_id BIGINT UNSIGNED NULL, ADD INDEX registration_complex_lookup (complex_id), ADD CONSTRAINT registration_complex_fk FOREIGN KEY (complex_id) REFERENCES complexes(id) ON UPDATE CASCADE ON DELETE SET NULL', dropSql: 'ALTER TABLE registration_requests DROP FOREIGN KEY registration_complex_fk, DROP INDEX registration_complex_lookup, DROP COLUMN complex_id' },
  { tableName: 'registration_requests', columnName: 'committee_id', addSql: 'ALTER TABLE registration_requests ADD COLUMN committee_id BIGINT UNSIGNED NULL, ADD INDEX registration_committee_lookup (committee_id), ADD CONSTRAINT registration_committee_fk FOREIGN KEY (committee_id) REFERENCES committees(id) ON UPDATE CASCADE ON DELETE SET NULL', dropSql: 'ALTER TABLE registration_requests DROP FOREIGN KEY registration_committee_fk, DROP INDEX registration_committee_lookup, DROP COLUMN committee_id' },
].map(createColumnMigration);

export async function up(connection) {
  for (const column of columns) await column.up(connection);
}

export async function down(connection) {
  const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM registration_requests WHERE complex_id IS NOT NULL OR committee_id IS NOT NULL');
  if (Number(row.count)) throw new Error('Restore the backup before rolling back registration placements.');
  for (const column of [...columns].reverse()) await column.down(connection);
}
