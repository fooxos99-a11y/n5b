export const MAX_TEACHER_POINT_TYPES = 40;

export function normalizeTeacherPointTypes(value) {
  let raw = value;
  if (!Array.isArray(raw)) {
    try {
      raw = JSON.parse(String(value || '[]'));
    } catch {
      raw = [];
    }
  }

  const usedIds = new Set();
  return (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_TEACHER_POINT_TYPES)
    .map((item, index) => {
      const label = String(item?.label || '').trim().slice(0, 80);
      const operation = item?.operation === 'deduction' ? 'deduction' : 'increase';
      const parsedPoints = Math.trunc(Number(item?.points));
      const points = Number.isFinite(parsedPoints)
        ? Math.min(1_000_000, Math.max(1, parsedPoints))
        : 1;
      const candidateId = /^[a-zA-Z0-9_-]{1,64}$/.test(String(item?.id || ''))
        ? String(item.id)
        : `type-${index + 1}`;
      let id = candidateId;
      let suffix = index + 1;
      while (usedIds.has(id)) id = `${candidateId}-${suffix++}`;
      usedIds.add(id);
      return { id, label, operation, points };
    })
    .filter((item) => item.label);
}
