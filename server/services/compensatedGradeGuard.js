export async function assertDailyGradeNotCompensated(connection, { studentId, date, component, compensationId = null }) {
  if (component === 'attendance') return;
  const [[row]] = await connection.query("SELECT id FROM student_day_compensations WHERE student_id = ? AND compensated_date = ? AND scope = 'program' AND cancelled_at IS NULL FOR UPDATE", [studentId, date]);
  if (row && Number(row.id) !== compensationId) {
    throw Object.assign(new Error('درجات هذا اليوم محفوظة كتعويض ولا يمكن استبدالها باختبار عادي.'), { status: 409, statusCode: 409 });
  }
}

export async function activeTrackCompensation(connection, studentId, weekStart) {
  const [[row]] = await connection.query("SELECT id FROM student_day_compensations WHERE student_id = ? AND period_date = ? AND scope = 'track' AND cancelled_at IS NULL FOR UPDATE", [studentId, weekStart]);
  return row || null;
}
