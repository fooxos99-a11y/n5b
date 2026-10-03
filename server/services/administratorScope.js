import { normalizeDashboardGrants } from '../../shared/dashboard-permissions.js';

/** A delegated account may only manage accounts and grant permissions within its own scope. */
export async function assertAdministratorScope(connection, actor, { targetId = null, permissions = [], managementPermission = 'administrators' } = {}) {
  if (actor?.role === 'manager') return;
  const denied = () => Object.assign(new Error('لا يمكنك إدارة حساب بصلاحيات تتجاوز صلاحياتك.'), { status: 403, statusCode: 403 });
  if (!['admin', 'supervisor'].includes(actor?.role)) throw denied();
  const [rows] = await connection.query(
    'SELECT permission_key AS permissionKey FROM supervisor_dashboard_permissions WHERE supervisor_id = ? FOR UPDATE',
    [actor.id],
  );
  const allowed = new Set(normalizeDashboardGrants(rows.map(row => row.permissionKey)));
  if (!allowed.has(managementPermission) || normalizeDashboardGrants(permissions).some(key => !allowed.has(key))) throw denied();
  if (targetId) {
    const [target] = await connection.query(
      'SELECT permission_key AS permissionKey FROM supervisor_dashboard_permissions WHERE supervisor_id = ? FOR UPDATE',
      [targetId],
    );
    if (normalizeDashboardGrants(target.map(row => row.permissionKey)).some(key => !allowed.has(key))) throw denied();
  }
}
