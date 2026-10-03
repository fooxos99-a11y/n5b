import express from 'express';
import { hasSupervisorDashboardPermission, permissionDenied } from '../services/dashboardPermissions.js';
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
  return router;
}
