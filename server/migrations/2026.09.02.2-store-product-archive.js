import { createColumnMigration } from '../services/columnMigration.js';

export const version = '2026.09.02.2';
export const { up, down } = createColumnMigration({
  tableName: 'store_products',
  columnName: 'deleted_at',
  addSql: 'ALTER TABLE store_products ADD COLUMN deleted_at TIMESTAMP NULL AFTER is_active',
  dropSql: 'ALTER TABLE store_products DROP COLUMN deleted_at',
});
