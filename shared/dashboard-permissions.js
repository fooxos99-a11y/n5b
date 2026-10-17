// Keep the legacy combined grant readable while new accounts use separate session grants.
export const DASHBOARD_PERMISSION_KEYS = Object.freeze([
  'manualAttendance', 'staffAttendance', 'registrationRequests', 'students', 'studentPlans',
  'narrationDay', 'quranPassing', 'calls', 'quranEvaluation', 'grades', 'weeklySession', 'trackSession',
  'families', 'supervisors', 'administrators', 'reciters', 'teachers', 'notifications', 'reports', 'whatsappSend', 'settings', 'store',
]);

export const SUPERVISOR_BASE_PERMISSIONS = Object.freeze(['quranEvaluation', 'studentPlans', 'calls', 'reports']);
export const RECITER_BASE_PERMISSIONS = Object.freeze(['calls']);
export const TEACHER_BASE_PERMISSIONS = Object.freeze(['reports']);

export function effectiveStaffPermissions(role, grants = []) {
  const permissions = normalizeDashboardGrants(grants);
  if (role === 'teacher') return [...TEACHER_BASE_PERMISSIONS];
  if (role === 'reciter') return normalizeDashboardGrants([...RECITER_BASE_PERMISSIONS, ...permissions]);
  if (role === 'supervisor') return normalizeDashboardGrants([...SUPERVISOR_BASE_PERMISSIONS, ...permissions]);
  return role === 'admin' ? permissions.filter(key => key !== 'quranEvaluation') : [];
}

export const hasExtendedReciterPermissions = permissions => normalizeDashboardGrants(permissions).some(key => !RECITER_BASE_PERMISSIONS.includes(key));

export function normalizeDashboardGrants(permissions = []) {
  const allowed = new Set(DASHBOARD_PERMISSION_KEYS);
  const values = (Array.isArray(permissions) ? permissions : [])
    .map(value => String(value || '').trim()).filter(value => allowed.has(value));
  return [...new Set(values.flatMap(value => value === 'grades' ? ['weeklySession', 'trackSession'] : [value]))];
}

export function gradingPermissionForComponent(component) {
  return component === 'weekly' ? 'weeklySession' : component === 'track' ? 'trackSession' : null;
}

export function scopeSessionGrade(grade, permissions) {
  if (!grade) return null;
  const allowed = new Set(normalizeDashboardGrants(permissions));
  if (allowed.has('weeklySession') && allowed.has('trackSession')) return grade;
  return {
    ...(allowed.has('weeklySession') ? { weeklySession: grade.weeklySession, weeklyDetail: grade.weeklyDetail } : {}),
    ...(allowed.has('trackSession') ? { trackSession: grade.trackSession, trackDetail: grade.trackDetail } : {}),
  };
}
