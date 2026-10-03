export async function requireComplex(connection, value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('اختر مجمعًا للحلقة.'), { statusCode: 422 });
  const [[row]] = await connection.query('SELECT id FROM complexes WHERE id = ? LIMIT 1', [id]);
  if (!row) throw Object.assign(new Error('المجمع المختار غير موجود.'), { statusCode: 422 });
  return id;
}

export async function assertStudentComplex(connection, committeeId, complexId) {
  const [[row]] = await connection.query('SELECT complex_id AS complexId FROM committees WHERE id = ?', [committeeId]);
  if (!row?.complexId) throw Object.assign(new Error('اربط الحلقة بمجمع قبل إضافة الطالب.'), { statusCode: 422 });
  // Imports may identify a circle directly, but that circle must belong to a complex.
  if (complexId === undefined) return;
  const id = await requireComplex(connection, complexId);
  if (Number(row.complexId) !== id) throw Object.assign(new Error('الحلقة لا تتبع المجمع المختار.'), { statusCode: 422 });
}
