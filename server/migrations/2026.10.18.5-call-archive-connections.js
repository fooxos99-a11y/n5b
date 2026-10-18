import { createColumnMigration } from '../services/columnMigration.js';

export const version = '2026.10.18.5';
const migration = createColumnMigration({ tableName: 'call_archive_participants', columnName: 'connection_sid',
  addSql: 'ALTER TABLE call_archive_participants ADD COLUMN connection_sid VARCHAR(100) NULL DEFAULT NULL' });
export const up = migration.up;
