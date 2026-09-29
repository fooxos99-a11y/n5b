export async function runCountedStatements(connection, statements) {
  const summary = {};
  for (const [key, statementsForKey] of Object.entries(statements)) {
    const queries = Array.isArray(statementsForKey) ? statementsForKey : [statementsForKey];
    summary[key] = 0;
    for (const sql of queries) {
      const [result] = await connection.query(sql);
      summary[key] += Number(result.affectedRows || 0);
    }
  }
  return summary;
}

export async function queryTaskGroups(connection, taskIds, sql, mapRow) {
  const ids = [...new Set((taskIds || []).map(Number).filter(Boolean))];
  const grouped = new Map();
  if (!ids.length) return grouped;
  const [rows] = await connection.query(sql, [ids]);
  for (const row of rows) {
    const taskId = Number(row.taskId);
    if (!grouped.has(taskId)) grouped.set(taskId, []);
    grouped.get(taskId).push(mapRow(row));
  }
  return grouped;
}
