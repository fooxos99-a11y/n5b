// Task handlers keep their existing transaction contract. A savepoint isolates each
// part, while replacement of an accepted session commits only as a complete batch.
export async function runRecitationSessionTransaction(pool, execute) {
  const connection = await pool.getConnection();
  const context = { superseded: false, failed: false };
  let savepoint = false;
  let broken = false;
  const scoped = {
    query: (...args) => connection.query(...args),
    execute: (...args) => connection.execute(...args),
    beginTransaction: async () => {
      await connection.query('SAVEPOINT recitation_part');
      savepoint = true;
    },
    commit: async () => {},
    rollback: async () => {
      if (!savepoint) return;
      try { await connection.query('ROLLBACK TO SAVEPOINT recitation_part'); }
      catch (error) { broken = true; throw error; }
    },
    release: () => {},
  };
  try {
    await connection.beginTransaction();
    const value = await execute(scoped, context);
    const rolledBack = broken || (context.superseded && context.failed);
    if (rolledBack) await connection.rollback();
    else await connection.commit();
    return { value, rolledBack };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function assertRecitationReplacementCoverage(connection, previousSessionId, taskIds) {
  const [previous] = await connection.query(`SELECT task_id AS taskId
    FROM student_quran_recitation_session_parts WHERE session_id = ? AND status = 'accepted'
    UNION SELECT task_id AS taskId FROM student_quran_recitation_attempts
    WHERE is_official = 1 AND (session_id = ? OR request_id LIKE ?)`,
  [previousSessionId, previousSessionId, `${previousSessionId}:%`]);
  const supplied = new Set(taskIds.map(Number));
  if (previous.some((part) => !supplied.has(Number(part.taskId)))) {
    const error = new Error('الجلسة البديلة لا تشمل جميع الأجزاء المعتمدة. أعد فتح جلسة التسميع كاملة.');
    error.statusCode = 409;
    throw error;
  }
}
