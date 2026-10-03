import { studyDateSql } from './seasonalHolidays.js';

export const uncompensatedTaskSql = (alias, { retainAccepted = false } = {}) => {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid task alias');
  const pending = `NOT EXISTS (SELECT 1 FROM student_day_compensations dc WHERE dc.student_id = ${alias}.student_id
    AND dc.compensated_date = ${alias}.task_date AND dc.scope = 'program' AND dc.cancelled_at IS NULL)`;
  return retainAccepted ? `(${alias}.teacher_completed = 1 OR ${pending})` : pending;
};

/** Administrative credit is separate from genuinely memorized material. */
export async function loadCompensatedPlanRanges(connection, { studentId, planId, throughDate }) {
  const [rows] = await connection.query(`SELECT credited_ranges AS ranges FROM student_day_compensations
    WHERE student_id = ? AND scope = 'program' AND cancelled_at IS NULL AND compensated_date <= ?
      AND ${studyDateSql('compensated_date')}`, [studentId, throughDate]);
  return rows.flatMap(row => {
    const ranges = typeof row.ranges === 'string' ? JSON.parse(row.ranges) : row.ranges;
    return (ranges || []).filter(range => Number(range.planId) === Number(planId));
  });
}
