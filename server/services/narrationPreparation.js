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
