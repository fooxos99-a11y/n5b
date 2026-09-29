import { createColumnMigration } from '../services/columnMigration.js';
export const version = '2026.09.22.2';
const migration = createColumnMigration({
  tableName: 'store_orders', columnName: 'rejected_at',
  addSql: 'ALTER TABLE store_orders ADD COLUMN rejected_at TIMESTAMP NULL AFTER fulfilled_at',
  dropSql: 'ALTER TABLE store_orders DROP COLUMN rejected_at',
});
const stockMigration = createColumnMigration({
  tableName: 'store_orders', columnName: 'stock_reserved',
  addSql: 'ALTER TABLE store_orders ADD COLUMN stock_reserved TINYINT(1) NULL AFTER rejected_at',
  dropSql: 'ALTER TABLE store_orders DROP COLUMN stock_reserved',
});
export async function up(connection) {
  await migration.up(connection);
  await stockMigration.up(connection);
}
export async function down(connection) {
  const [[column]] = await connection.query(`SELECT COUNT(*) AS count FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'store_orders' AND column_name = 'rejected_at'`);
  if (Number(column.count)) {
    const [[row]] = await connection.query('SELECT COUNT(*) AS count FROM store_orders WHERE rejected_at IS NOT NULL');
    if (Number(row.count)) throw new Error('Cannot remove refunded order history. No orders were changed.');
  }
  await migration.down(connection);
  await stockMigration.down(connection);
}
