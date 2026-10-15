const invalid = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });

export async function normalizeNarrationRanges(ranges, { readAyah, mergeRanges, measureFaces }) {
  if (!Array.isArray(ranges) || !ranges.length || ranges.length > 30) {
    throw invalid('حدد من مقطع واحد إلى 30 مقطعًا لكل طالب.');
  }
  const normalized = [];
  for (const range of ranges) {
    const values = ['startSurah', 'startAyah', 'endSurah', 'endAyah'].map(key => Number(range?.[key]));
    if (values.some(value => !Number.isSafeInteger(value) || value < 1)) throw invalid('حدد السورة والآية لبداية كل مقطع ونهايته.');
    const [startSurah, startAyah, endSurah, endAyah] = values;
    if (startSurah > endSurah || (startSurah === endSurah && startAyah > endAyah)) throw invalid('نهاية المقطع يجب أن تكون بعد بدايته أو مساوية لها.');
    const [start, end] = await Promise.all([readAyah(startSurah, startAyah), readAyah(endSurah, endAyah)]);
    if (!start || !end) throw invalid('إحدى الآيات غير موجودة. راجع حدود المقطع.');
    normalized.push({ startSurah, startAyah, startPage: start.page, endSurah, endAyah, endPage: end.page });
  }
  // Merge overlaps so the same ayah cannot be counted twice in a student's session.
  const merged = await mergeRanges(normalized);
  return Promise.all(merged.map(async range => ({ ...range, faces: await measureFaces(range) })));
}

export async function prepareNarrationAssignments(mode, assignments, students, dependencies) {
  if (mode === undefined || mode === 'full') return null;
  if (mode !== 'manual') throw invalid('اختر طريقة السرد.');
  if (!Array.isArray(assignments) || !assignments.length || assignments.length > students.length) throw invalid('حدد مقاطع طالب واحد على الأقل ضمن الحلقات المختارة.');
  const allowed = new Set(students.map(student => Number(student.id)));
  const result = new Map();
  for (const assignment of assignments) {
    const id = Number(assignment?.studentId);
    if (!Number.isSafeInteger(id) || !allowed.has(id)) throw invalid('أحد الطلاب خارج الحلقات المسموح بها.', 403);
    if (result.has(id)) throw invalid('تكرر الطالب في قائمة السرد.');
    result.set(id, await normalizeNarrationRanges(assignment.ranges, dependencies));
  }
  return result;
}

/** Use the same prepared ranges and juz intersections for preview and persistence. */
export async function buildNarrationStudentPreparation({ students, assignments = null, startDate }, {
  loadMemorizedRanges, mergeRanges, collectParts, nextDate,
}) {
  const prepared = [];
  const skippedStudents = [];
  for (const student of students) {
    const studentId = Number(student.id);
    if (assignments && !assignments.has(studentId)) continue;
    const ranges = assignments ? assignments.get(studentId)
      : await mergeRanges(await loadMemorizedRanges(studentId, { beforeDate: nextDate(startDate) }));
    const juzParts = [];
    const measuredRanges = [];
    for (const range of ranges) {
      const parts = await collectParts([range]);
      juzParts.push(...parts);
      measuredRanges.push({ ...range, faces: parts.reduce((sum, part) => sum + Number(part.faces || 0), 0) });
    }
    const identity = { studentId, name: student.name, committeeId: student.committeeId == null ? null : Number(student.committeeId),
      committeeName: student.committeeName || '' };
    if (!juzParts.length) {
      skippedStudents.push({ ...identity, reason: 'no-ranges' });
      continue;
    }
    prepared.push({ ...identity, ranges: measuredRanges, juzParts,
      totalFaces: juzParts.reduce((sum, part) => sum + Number(part.faces || 0), 0) });
  }
  return { students: prepared, skippedStudents };
}

/** Share the existing event-creation roster restriction with read-only preparation. */
export async function loadNarrationPreparationStudents(connection, auth, committeeIds = []) {
  const filters = [];
  const params = [];
  if (committeeIds.length) {
    filters.push(`s.committee_id IN (${committeeIds.map(() => '?').join(', ')})`);
    params.push(...committeeIds);
  }
  if (auth?.role === 'supervisor') {
    filters.push('EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id)');
    params.push(auth.id);
  }
  const [students] = await connection.query(
    `SELECT s.id, s.name, s.committee_id AS committeeId, c.name AS committeeName FROM students s LEFT JOIN committees c ON c.id = s.committee_id ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''} ORDER BY s.name`,
    params,
  );
  return students;
}
