export const version = '2026.09.09.2';

export async function up(connection) {
  const [indexes] = await connection.query('SHOW INDEX FROM store_orders');
  if (!indexes.some((index) => index.Key_name === 'store_orders_student_date')) {
    await connection.query('ALTER TABLE store_orders ADD INDEX store_orders_student_date (student_id, order_date)');
  }
  if (indexes.some((index) => index.Key_name === 'store_orders_student_daily_unique')) {
    await connection.query('ALTER TABLE store_orders DROP INDEX store_orders_student_daily_unique');
  }
}

export async function down(connection) {
  const [duplicates] = await connection.query(`SELECT student_id FROM store_orders
    WHERE order_date IS NOT NULL GROUP BY student_id, order_date HAVING COUNT(*) > 1 LIMIT 1`);
  if (duplicates.length) throw new Error('Cannot restore the daily purchase limit while multiple daily orders exist. No orders were changed.');
  const [indexes] = await connection.query('SHOW INDEX FROM store_orders');
  if (!indexes.some((index) => index.Key_name === 'store_orders_student_daily_unique')) {
    await connection.query('ALTER TABLE store_orders ADD UNIQUE INDEX store_orders_student_daily_unique (student_id, order_date)');
  }
}
