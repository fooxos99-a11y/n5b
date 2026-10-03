const invalid = message => Object.assign(new Error(message), { statusCode: 422 });
const placementId = (value, message) => {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^[1-9]\d*$/.test(String(value).trim())) throw invalid(message);
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw invalid(message);
  return id;
};

/** Resolve names and membership from this tenant's database, never from submitted labels. */
export async function requireRegistrationPlacement(connection, { complexId, committeeId }, { allowDerivedComplex = false, lock = false } = {}) {
  const circleId = placementId(committeeId, 'اختر الحلقة.');
  const deriveComplex = allowDerivedComplex && (complexId === undefined || complexId === null);
  const selectedComplex = deriveComplex ? null : placementId(complexId, 'اختر المجمع.');
  const [[row]] = await connection.query(`SELECT c.id AS committeeId, c.name AS committeeName,
    c.complex_id AS complexId, x.name AS complexName
    FROM committees c JOIN complexes x ON x.id = c.complex_id WHERE c.id = ? ${lock ? 'FOR SHARE' : ''}`, [circleId]);
  if (!row) throw invalid('الحلقة غير موجودة أو غير مرتبطة بمجمع.');
  if (!deriveComplex && Number(row.complexId) !== selectedComplex) throw invalid('الحلقة لا تتبع المجمع المختار.');
  return { committeeId: Number(row.committeeId), committeeName: row.committeeName, complexId: Number(row.complexId), complexName: row.complexName };
}

export async function loadRegistrationPlacementOptions(connection) {
  const [complexes] = await connection.query('SELECT id, name FROM complexes ORDER BY name, id');
  const [committees] = await connection.query(`SELECT c.id, c.name, c.complex_id AS complexId
    FROM committees c JOIN complexes x ON x.id = c.complex_id ORDER BY c.name, c.id`);
  return { complexes, committees };
}
