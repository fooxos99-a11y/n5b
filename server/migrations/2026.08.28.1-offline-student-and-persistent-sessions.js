const columnExists = async (connection, tableName, columnName) => {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [tableName, columnName],
  );
  return Number(row?.count || 0) > 0;
};

const indexExists = async (connection, tableName, indexName) => {
  const [[row]] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [tableName, indexName],
  );
  return Number(row?.count || 0) > 0;
};

export const version = '2026.08.28.1';

export async function up(connection) {
  await connection.query('ALTER TABLE auth_sessions MODIFY expires_at DATETIME NULL');
  await connection.query('UPDATE auth_sessions SET expires_at = NULL');

  if (!(await columnExists(connection, 'store_orders', 'order_date'))) {
    await connection.query('ALTER TABLE store_orders ADD COLUMN order_date DATE NULL AFTER points_price');
  }
  if (!(await columnExists(connection, 'store_orders', 'request_id'))) {
    await connection.query('ALTER TABLE store_orders ADD COLUMN request_id CHAR(36) NULL AFTER order_date');
  }
  await connection.query(
    `UPDATE store_orders current_order
     JOIN (
       SELECT student_id, DATE(created_at) AS purchase_date, MAX(id) AS selected_id
       FROM store_orders
       WHERE created_at IS NOT NULL
       GROUP BY student_id, DATE(created_at)
     ) daily_order ON daily_order.selected_id = current_order.id
     SET current_order.order_date = daily_order.purchase_date
     WHERE current_order.order_date IS NULL`,
  );
  if (!(await indexExists(connection, 'store_orders', 'store_orders_request_unique'))) {
    await connection.query('ALTER TABLE store_orders ADD UNIQUE KEY store_orders_request_unique (request_id)');
  }
  if (!(await indexExists(connection, 'store_orders', 'store_orders_student_daily_unique'))) {
    await connection.query('ALTER TABLE store_orders ADD UNIQUE KEY store_orders_student_daily_unique (student_id, order_date)');
  }
}
