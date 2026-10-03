/** Uses the same trusted student scope as the surrounding report. */
export async function loadCompensationAudit(scope, from, to) {
  const [rows] = await scope.query(`SELECT dc.id, dc.student_id AS studentId, s.name AS studentName,
    c.name AS committeeName, dc.scope, DATE_FORMAT(dc.compensated_date, '%Y-%m-%d') AS date,
    dc.actor_name AS actorName, DATE_FORMAT(dc.recorded_at, '%Y-%m-%dT%H:%i:%s') AS recordedAt,
    dc.excuse_reference AS excuseReference, dc.credited_components AS components,
    DATE_FORMAT(dc.cancelled_at, '%Y-%m-%dT%H:%i:%s') AS cancelledAt,
    dc.cancelled_by_name AS cancelledByName, dc.cancellation_reason AS cancellationReason
    FROM student_day_compensations dc JOIN students s ON s.id = dc.student_id
    LEFT JOIN committees c ON c.id = s.committee_id
    WHERE dc.compensated_date BETWEEN ? AND ? AND ${scope.student('dc.student_id')}
    ORDER BY dc.compensated_date DESC, dc.id DESC`, [from, to]);
  return rows.map(row => ({ ...row, id: Number(row.id), studentId: Number(row.studentId),
    components: typeof row.components === 'string' ? JSON.parse(row.components) : row.components }));
}
