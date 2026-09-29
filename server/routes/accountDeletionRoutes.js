import express from 'express';
import { db } from '../db.js';
import { hasSupervisorDashboardPermission } from '../services/dashboardPermissions.js';

const router = express.Router();

/** The manager, or an administrator granted the settings pages. */
const canManageDeletionRequests = async (req) => req.auth?.role === 'manager'
  || (req.auth?.role === 'admin' && await hasSupervisorDashboardPermission(req.auth.id, ['settings']));

router.get('/me', async (req, res, next) => {
  try {
    const [[request]] = await db().query(
      `
      SELECT
        id,
        status,
        manager_note AS managerNote,
        requested_at AS requestedAt,
        updated_at AS updatedAt
      FROM account_deletion_requests
      WHERE user_role = ? AND user_id = ?
      LIMIT 1
      `,
      [req.auth.role, req.auth.id],
    );
    return res.json(request || null);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (!['student', 'supervisor', 'admin', 'reciter', 'manager'].includes(req.auth.role)) {
      return res.status(403).json({ message: 'هذا النوع من الحسابات لا يدعم طلب الحذف.' });
    }
    await db().query(
      `
      INSERT INTO account_deletion_requests
        (user_role, user_id, user_name, status, manager_note, requested_at)
      VALUES (?, ?, ?, 'pending', NULL, NOW())
      ON DUPLICATE KEY UPDATE
        user_name = VALUES(user_name),
        status = 'pending',
        manager_note = NULL,
        requested_at = NOW(),
        updated_at = NOW()
      `,
      [req.auth.role, req.auth.id, String(req.auth.name || 'مستخدم').slice(0, 180)],
    );
    return res.status(201).json({ ok: true, status: 'pending' });
  } catch (error) {
    return next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    const [result] = await db().query(
      `
      UPDATE account_deletion_requests
      SET status = 'cancelled', manager_note = NULL
      WHERE user_role = ? AND user_id = ? AND status = 'pending'
      `,
      [req.auth.role, req.auth.id],
    );
    if (!result.affectedRows) {
      return res.status(409).json({ message: 'لا يوجد طلب حذف معلّق يمكن إلغاؤه.' });
    }
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/requests', async (req, res, next) => {
  try {
    if (!await canManageDeletionRequests(req)) {
      return res.status(403).json({ message: 'لا تملك صلاحية طلبات الحذف.' });
    }
    const [rows] = await db().query(
      `
      SELECT
        id,
        user_role AS userRole,
        user_id AS userId,
        user_name AS userName,
        status,
        manager_note AS managerNote,
        requested_at AS requestedAt,
        updated_at AS updatedAt
      FROM account_deletion_requests
      ORDER BY (status = 'pending') DESC, requested_at DESC
      LIMIT 200
      `,
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
});

router.put('/requests/:id', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    if (!await canManageDeletionRequests(req)) {
      return res.status(403).json({ message: 'لا تملك صلاحية طلبات الحذف.' });
    }
    const status = ['completed', 'rejected'].includes(req.body.status)
      ? req.body.status
      : null;
    const managerNote = String(req.body.managerNote || '').trim().slice(0, 500) || null;
    if (!status) return res.status(422).json({ message: 'حالة الطلب غير صالحة.' });
    await connection.beginTransaction();
    const [[deletionRequest]] = await connection.query(
      `
      SELECT id, user_role AS userRole, user_id AS userId
      FROM account_deletion_requests
      WHERE id = ? AND status = 'pending'
      FOR UPDATE
      `,
      [req.params.id],
    );
    if (!deletionRequest) {
      await connection.rollback();
      return res.status(404).json({ message: 'الطلب غير موجود أو تمت معالجته مسبقاً.' });
    }

    const processApprovedAccountDeletionResult = await processApprovedAccountDeletion({ status, deletionRequest, connection, res });
    if (processApprovedAccountDeletionResult) { return processApprovedAccountDeletionResult; }
        const [result] = await connection.query(
      `
      UPDATE account_deletion_requests
      SET status = ?, manager_note = ?
      WHERE id = ? AND status = 'pending'
      `,
      [status, managerNote, req.params.id],
    );
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: 'الطلب غير موجود أو تمت معالجته مسبقاً.' });
    }
    await connection.commit();
    return res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

export default router;

/** Delete only the approved account and related records within the existing manager-owned transaction. */
async function processApprovedAccountDeletion({ status, deletionRequest, connection, res }) {
if (status !== 'completed') { return null; }

      if (deletionRequest.userRole === 'manager') {
        await connection.rollback();
        return res.status(409).json({ message: 'طلب حذف حساب المدير يُعالج من إدارة المنصة.' });
      }

      await connection.query(
        'DELETE FROM auth_sessions WHERE user_role = ? AND user_id = ?',
        [deletionRequest.userRole, deletionRequest.userId],
      );
      await connection.query(
        'DELETE FROM app_notification_recipients WHERE user_role = ? AND user_id = ?',
        [deletionRequest.userRole, deletionRequest.userId],
      );

      await connection.query('DELETE FROM notification_devices WHERE user_role = ? AND user_id = ?', [deletionRequest.userRole, deletionRequest.userId]);

      if (deletionRequest.userRole === 'student') {
        const studentTables = [
          'whatsapp_messages',
          'attendance_records',
          'student_achievements',
          'student_path_progress',
          'supervisor_student_point_awards',
          'student_point_transactions',
          'student_quran_prior_memorization',
        ];
        for (const table of studentTables) {
          await connection.query(`DELETE FROM ${table} WHERE student_id = ?`, [deletionRequest.userId]);
        }
        await connection.query("DELETE FROM push_subscriptions WHERE user_role = 'student' AND user_id = ?", [deletionRequest.userId]);
        const [deleted] = await connection.query('DELETE FROM students WHERE id = ?', [deletionRequest.userId]);
        if (!deleted.affectedRows) {
          await connection.rollback();
          return res.status(404).json({ message: 'الحساب المطلوب حذفه غير موجود.' });
        }
      } else {
        const [[account]] = await connection.query(
          'SELECT id, role FROM supervisors WHERE id = ? LIMIT 1',
          [deletionRequest.userId],
        );
        if (!account || account.role !== deletionRequest.userRole) {
          await connection.rollback();
          return res.status(404).json({ message: 'الحساب المطلوب حذفه غير موجود.' });
        }
        if (deletionRequest.userRole === 'supervisor') {
          await connection.query("DELETE FROM push_subscriptions WHERE user_role = 'supervisor' AND user_id = ?", [deletionRequest.userId]);
        }
        await connection.query('DELETE FROM supervisors WHERE id = ?', [deletionRequest.userId]);
      }


  return null;
}
