import { db } from '../db.js';
import { requireUndoPermission } from './undoJournal.js';

export const DASHBOARD_PERMISSION_KEYS = [
  'manualAttendance',
  'staffAttendance',
  'registrationRequests',
  'students',
  'studentPlans',
  'narrationDay',
  'calls',
  'quranEvaluation',
  'grades',
  'families',
  'supervisors',
  'administrators',
  'notifications',
  'reports',
  'whatsappSend',
  'settings',
  'store',
];

const DASHBOARD_PERMISSION_SET = new Set(DASHBOARD_PERMISSION_KEYS);

export function cleanDashboardPermissions(permissions = []) {
  return [...new Set(
    (Array.isArray(permissions) ? permissions : [])
      .map((permission) => String(permission || '').trim())
      .filter((permission) => DASHBOARD_PERMISSION_SET.has(permission))
  )];
}

export function cleanAdministratorDashboardPermissions(permissions = []) {
  return cleanDashboardPermissions(permissions).filter((permission) => permission !== 'quranEvaluation');
}

export async function getSupervisorDashboardPermissions(supervisorId) {
  if (!supervisorId) return [];
  const [rows] = await db().query(
    `
    SELECT
      s.role,
      p.permission_key AS permissionKey
    FROM supervisors s
    LEFT JOIN supervisor_dashboard_permissions p
      ON p.supervisor_id = s.id
    WHERE s.id = ?
    ORDER BY permission_key ASC
    `,
    [supervisorId]
  );
  const role = rows[0]?.role || '';
  const permissions = cleanDashboardPermissions(rows.map((row) => row.permissionKey));
  if (role === 'reciter') return ['quranEvaluation'];
  return role === 'admin'
    ? cleanAdministratorDashboardPermissions(permissions)
    : permissions;
}

export async function hasSupervisorDashboardPermission(supervisorId, permissionKeys) {
  const keys = cleanDashboardPermissions(Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys]);
  if (!keys.length || !supervisorId) return false;
  const permissions = await getSupervisorDashboardPermissions(supervisorId);
  return keys.some((key) => permissions.includes(key));
}

export function permissionDenied(res) {
  return res.status(403).json({ message: 'ليست لديك صلاحية لتنفيذ هذا الإجراء.' });
}

export function hasOfflineRecitationAccountAccess(role, path) {
  return ['supervisor', 'reciter', 'admin'].includes(String(role || ''))
    && String(path || '').startsWith('/offline-recitation');
}

export function requirePermission(permissionKeys, res, next) {
  if (typeof permissionKeys !== 'string' && !Array.isArray(permissionKeys)) {
    const req = permissionKeys;
    if (req.auth?.role !== 'manager') return permissionDenied(res);
    requireUndoPermission(null);
    return next();
  }

  const keys = cleanDashboardPermissions(Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys]);
  return async (req, routeRes, routeNext) => {
    try {
      if (req.auth?.role === 'manager') { requireUndoPermission(keys); return routeNext(); }
      if (['supervisor', 'admin', 'reciter'].includes(req.auth?.role) && await hasSupervisorDashboardPermission(req.auth.id, keys)) {
        requireUndoPermission(keys);
        return routeNext();
      }
      return permissionDenied(routeRes);
    } catch (error) {
      return routeNext(error);
    }
  };
}
