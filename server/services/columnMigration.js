export function createColumnMigration({ tableName, columnName, addSql, dropSql }) {
  const exists = async (connection) => {
    const [[row]] = await connection.query(
      `SELECT COUNT(*) AS count FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
      [tableName, columnName],
    );
    return Number(row?.count || 0) > 0;
  };
  return {
    async up(connection) {
      if (!await exists(connection)) await connection.query(addSql);
    },
    async down(connection) {
      if (await exists(connection)) await connection.query(dropSql);
    },
  };
}
