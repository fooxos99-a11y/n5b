// Keep the legacy combined grant readable while new accounts use separate session grants.
export const DASHBOARD_PERMISSION_KEYS = Object.freeze([
  'manualAttendance', 'staffAttendance', 'registrationRequests', 'students', 'studentPlans',
  'narrationDay', 'calls', 'quranEvaluation', 'grades', 'weeklySession', 'trackSession',
  'families', 'supervisors', 'administrators', 'notifications', 'reports', 'whatsappSend', 'settings', 'store',
]);

export const SUPERVISOR_BASE_PERMISSIONS = Object.freeze(['quranEvaluation', 'studentPlans', 'calls', 'reports']);

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
