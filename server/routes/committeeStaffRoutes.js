import express from 'express';
import { cleanDashboardPermissions, requirePermission } from '../services/dashboardPermissions.js';
import { assertAdministratorScope } from '../services/administratorScope.js';
import { revokeAuthSessionsForUser } from '../services/authSessions.js';
import { hashStudentPassword } from '../services/studentPassword.js';

/** Shared account lifecycle for committee-linked staff with role-specific access rules. */
export function createCommitteeStaffRouter({ db, normalizeStaffAccount, ensureLoginNumberIsAvailable, ensureCommitteeIdsExist }, {
  role, label, permission, singleCommittee = false, onRevoke = async () => {},
}) {
  if (!['reciter', 'teacher'].includes(role)) throw new Error('Unsupported committee staff role.');
  const router = express.Router();
  router.use(requirePermission(permission));
  const missing = () => Object.assign(new Error(`${label} غير موجود.`), { status: 404 });
  const accountId = value => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error('الحساب غير صالح.'), { status: 422 });
    return id;
  };
  router.get('/', async (req, res, next) => {
    try {
      const search = String(req.query.search || '').trim().slice(0, 180);
      const [rows] = await db().query(`SELECT id,name,login_number AS loginNumber,national_id AS nationalId,phone,role,is_active AS isActive
        FROM supervisors WHERE role=? AND name LIKE ? ORDER BY created_at DESC`, [role, `%${search}%`]);
      const [grants] = await db().query('SELECT p.supervisor_id AS staffId,p.permission_key AS permissionKey FROM supervisor_dashboard_permissions p JOIN supervisors s ON s.id=p.supervisor_id WHERE s.role=?', [role]);
      const [links] = await db().query('SELECT sc.supervisor_id AS staffId,sc.committee_id AS committeeId FROM supervisor_committees sc JOIN supervisors s ON s.id=sc.supervisor_id WHERE s.role=?', [role]);
      res.json(rows.map(row => ({ ...row, isActive: Boolean(row.isActive),
        permissions: role === 'teacher' ? [] : cleanDashboardPermissions(grants.filter(item => Number(item.staffId) === Number(row.id)).map(item => item.permissionKey)),
        committeeIds: links.filter(item => Number(item.staffId) === Number(row.id)).map(item => String(item.committeeId)),
      })));
    } catch (error) { next(error); }
  });

  async function save(req, res, next) {
    const connection = await db().getConnection();
    try {
      const account = normalizeStaffAccount(req.body, `اسم ${label}`);
      const permissions = cleanDashboardPermissions(req.body.permissions).filter(key => key !== (role === 'teacher' ? 'reports' : 'calls'));
      if (role === 'teacher' && permissions.length) throw Object.assign(new Error('حساب المعلم مخصص لمؤشرات حلقته فقط.'), { status: 422 });
      await connection.beginTransaction();
      const id = req.params.id ? accountId(req.params.id) : null;
      await assertAdministratorScope(connection, req.auth, { targetId: id, permissions: role === 'teacher' ? ['reports'] : permissions, managementPermission: permission });
      if (id) {
        const [[existing]] = await connection.query('SELECT id FROM supervisors WHERE id=? AND role=? FOR UPDATE', [id, role]);
        if (!existing) throw missing();
      }
      const committeeIds = await ensureCommitteeIdsExist(connection, req.body.committeeIds, { required: singleCommittee });
      if (singleCommittee && committeeIds.length !== 1) throw Object.assign(new Error('اختر حلقة واحدة للمعلم.'), { status: 422 });
      await ensureLoginNumberIsAvailable(connection, account.loginNumber, id ? { type: 'supervisor', id } : {});
      const passwordChanged = req.body.password !== undefined && req.body.password !== '';
      const passwordHash = !id || passwordChanged ? await hashStudentPassword(req.body.password) : null;
      let staffId = id;
      if (!id) {
        const [result] = await connection.query('INSERT INTO supervisors(name,login_number,national_id,phone,job_title,role,password_hash) VALUES(?,?,?,?,?,?,?)',
          [account.name, account.loginNumber, account.nationalId, account.phone, label.replace(/^ال/, ''), role, passwordHash]);
        staffId = result.insertId;
      } else {
        await connection.query('UPDATE supervisors SET name=?,login_number=?,national_id=?,phone=? WHERE id=? AND role=?', [account.name, account.loginNumber, account.nationalId, account.phone, id, role]);
        if (passwordChanged) await connection.query('UPDATE supervisors SET password_hash=? WHERE id=?', [passwordHash, id]);
        await connection.query('DELETE FROM supervisor_dashboard_permissions WHERE supervisor_id=?', [id]);
        await connection.query('DELETE FROM supervisor_committees WHERE supervisor_id=?', [id]);
        await revokeAuthSessionsForUser(connection, role, id);
        await onRevoke(connection, id);
      }
      if (permissions.length) await connection.query('INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES ?', [permissions.map(key => [staffId, key])]);
      if (committeeIds.length) await connection.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES ?', [committeeIds.map(committeeId => [staffId, committeeId])]);
      await connection.commit();
      res.status(id ? 200 : 201).json({ ok: true, id: staffId, ...account, role, permissions, committeeIds: committeeIds.map(String) });
    } catch (error) { await connection.rollback(); next(error); }
    finally { connection.release(); }
  }
  router.post('/', save);
  router.put('/:id', save);
  router.put('/:id/active', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const id = accountId(req.params.id);
      if (typeof req.body.isActive !== 'boolean') throw Object.assign(new Error('حالة الحساب غير صالحة.'), { status: 422 });
      await connection.beginTransaction();
      await assertAdministratorScope(connection, req.auth, { targetId: id, managementPermission: permission });
      const [result] = await connection.query('UPDATE supervisors SET is_active=? WHERE id=? AND role=?', [req.body.isActive ? 1 : 0, id, role]);
      if (!result.affectedRows) throw missing();
      if (!req.body.isActive) {
        await revokeAuthSessionsForUser(connection, role, id);
        await onRevoke(connection, id);
      }
      await connection.commit();
      res.json({ ok: true });
    } catch (error) { await connection.rollback(); next(error); }
    finally { connection.release(); }
  });
  router.delete('/:id', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const id = accountId(req.params.id);
      await connection.beginTransaction();
      await assertAdministratorScope(connection, req.auth, { targetId: id, managementPermission: permission });
      const [[existing]] = await connection.query('SELECT id FROM supervisors WHERE id=? AND role=? FOR UPDATE', [id, role]);
      if (!existing) throw missing();
      await revokeAuthSessionsForUser(connection, role, id);
      await onRevoke(connection, id);
      await connection.query('DELETE FROM supervisors WHERE id=? AND role=?', [id, role]);
      await connection.commit();
      res.json({ ok: true });
    } catch (error) { await connection.rollback(); next(error); }
    finally { connection.release(); }
  });
  return router;
}
