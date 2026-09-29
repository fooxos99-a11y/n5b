import { createColumnMigration } from '../services/columnMigration.js';

export const version = '2026.09.29.2';
export const { up, down } = createColumnMigration({
  tableName: 'students',
  columnName: 'password_hash',
  addSql: 'ALTER TABLE students ADD COLUMN password_hash VARCHAR(255) NULL',
  dropSql: 'ALTER TABLE students DROP COLUMN password_hash',
});
