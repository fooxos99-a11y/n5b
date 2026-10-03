/** Administrative grants retain the supervisor's assigned student scope. */
export async function assertSupervisorStudentScope(connection, actor, { studentId = null, committeeIds = [] } = {}) {
  if (actor?.role !== 'supervisor') return;
  const denied = () => Object.assign(new Error('لا يمكنك إدارة طالب خارج حلقاتك.'), { status: 403, statusCode: 403 });
  if (studentId) {
    const [[student]] = await connection.query(`SELECT 1 AS allowed FROM students s
      JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ? WHERE s.id = ?`, [actor.id, studentId]);
    if (!student) throw denied();
  }
  if (committeeIds.length) {
    const [assigned] = await connection.query('SELECT committee_id AS id FROM supervisor_committees WHERE supervisor_id = ?', [actor.id]);
    const allowed = new Set(assigned.map(row => Number(row.id)));
    if (committeeIds.some(id => !allowed.has(Number(id)))) throw denied();
  }
}
