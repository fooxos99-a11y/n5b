export function passingNotificationTarget(action) {
  if (!action || action.kind !== 'passing' || !['branch', 'hafiz'].includes(action.type)
    || !Number.isSafeInteger(action.studentId) || action.studentId <= 0
    || !Number.isInteger(action.juz) || action.juz < 1 || action.juz > 30) return '';
  return `/dashboard/passing?studentId=${action.studentId}&type=${action.type}&juz=${action.juz}`;
}
export function parsePassingNotificationAction(value) {
  let action;
  try { action = typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
  return passingNotificationTarget(action) ? { kind: 'passing', studentId: action.studentId, type: action.type, juz: action.juz } : null;
}
