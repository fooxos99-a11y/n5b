import express from 'express';
import { hasSupervisorDashboardPermission, permissionDenied, requirePermission } from '../services/dashboardPermissions.js';
import { assertSupervisorStudentScope } from '../services/supervisorStudentScope.js';
import { loadStudentPlanPause, saveStudentPlanPause } from '../services/studentPlanPause.js';
import { studentPlanPauseStatus } from '../../shared/student-plan-pause.js';

export function createStudentPlanPauseRouter({ db, requireRead }) {
  const router = express.Router();
  const canManage = async req => req.auth?.role === 'manager'
    || (req.auth?.role === 'admin' && await hasSupervisorDashboardPermission(req.auth.id, 'studentPlans'));
  router.get('/', requireRead, async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store').json({ ...studentPlanPauseStatus(await loadStudentPlanPause(db())), canManage: await canManage(req) });
    } catch (error) { next(error); }
  });
  router.put('/', async (req, res, next) => {
    try {
      if (!await canManage(req)) return permissionDenied(res);
      const result = await saveStudentPlanPause(db(), { paused: req.body?.paused, revision: req.body?.revision,
        actor: { role: req.auth.role, id: req.auth.id, name: req.auth.name || '' } });
      return res.set('Cache-Control', 'no-store').json({ ...result, canManage: true });
    } catch (error) { return next(error); }
  });
  const studentScope = async req => {
    const studentId = Number(req.params.studentId);
    if (!Number.isSafeInteger(studentId) || studentId <= 0) throw Object.assign(new Error('معرّف الطالب غير صحيح.'), { status: 422 });
    await assertSupervisorStudentScope(db(), req.auth, { studentId });
    const [[student]] = await db().query('SELECT id FROM students WHERE id = ?', [studentId]);
    if (!student) throw Object.assign(new Error('الطالب غير موجود.'), { status: 404 });
    return studentId;
  };
  router.get('/:studentId', requirePermission('studentPlans'), async (req, res, next) => {
    try {
      const studentId = await studentScope(req);
      res.set('Cache-Control', 'no-store').json({ ...studentPlanPauseStatus(await loadStudentPlanPause(db(), studentId)), canManage: true });
    } catch (error) { next(error); }
  });
  router.put('/:studentId', requirePermission('studentPlans'), async (req, res, next) => {
    try {
      const studentId = await studentScope(req);
      res.json({ ...await saveStudentPlanPause(db(), { studentId, paused: req.body?.paused, revision: req.body?.revision,
        actor: { role: req.auth.role, id: req.auth.id, name: req.auth.name || '' } }), canManage: true });
    } catch (error) { next(error); }
  });
  return router;
}
