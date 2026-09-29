export async function assertStudentIdentityAvailable(connection, nationalId, excludeId = 0) {
  if (!nationalId) return;
  const [[row]] = await connection.query('SELECT id FROM students WHERE national_id = ? AND id <> ? LIMIT 1 FOR UPDATE', [nationalId, Number(excludeId)]);
  if (row) throw Object.assign(new Error('رقم الهوية مستخدم لطالب آخر.'), {status:409, statusCode:409});
}
