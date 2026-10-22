import express from 'express';
import { hasSupervisorDashboardPermission, permissionDenied } from '../services/dashboardPermissions.js';
import { assertSupervisorStudentScope } from '../services/supervisorStudentScope.js';
import { loadAutomaticTemplate, prepareAutomaticRanges, saveAutomaticPriorOnly, saveAutomaticTemplate } from '../services/quranAutomaticPlan.js';

export function createAutomaticPlanRouter({ db, requireRead }) {
  const router = express.Router();
  const canManage = async req => req.auth?.role === 'manager'
    || (req.auth?.role === 'admin' && await hasSupervisorDashboardPermission(req.auth.id, 'studentPlans'));
  router.use(requireRead);
  router.get('/', async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json({ ...await loadAutomaticTemplate(db()), canManage: await canManage(req) }); }
    catch (error) { next(error); }
  });
  router.put('/', async (req, res, next) => {
    try {
      if (!await canManage(req)) return permissionDenied(res);
      res.json({ template: await saveAutomaticTemplate(db(), req.body), canManage: true });
    } catch (error) { next(error); }
  });
  router.post('/:studentId/prior-memorization', async (req, res, next) => {
    try {
      const studentId = Number(req.params.studentId);
      if (!Number.isSafeInteger(studentId) || studentId <= 0) return res.status(422).json({ message: 'معرّف الطالب غير صحيح.' });
      await assertSupervisorStudentScope(db(), req.auth, { studentId });
      res.json(await saveAutomaticPriorOnly(db(), { studentId, ranges: req.body.ranges }));
    } catch (error) { next(error); }
  });
  router.post('/:studentId/preview', async (req, res, next) => {
    try {
      const studentId = Number(req.params.studentId);
      if (!Number.isSafeInteger(studentId) || studentId <= 0) return res.status(422).json({ message: 'معرّف الطالب غير صحيح.' });
      await assertSupervisorStudentScope(db(), req.auth, { studentId });
      const [[student]] = await db().query('SELECT id FROM students WHERE id = ?', [studentId]);
      if (!student) return res.status(404).json({ message: 'الطالب غير موجود.' });
      let current = null;
      if (req.body.currentPlanId !== null && req.body.currentPlanId !== undefined) {
        const [[plan]] = await db().query(`SELECT id, track, start_surah AS startSurah, start_ayah AS startAyah, start_page AS startPage,
          end_surah AS endSurah, end_ayah AS endAyah, end_page AS endPage FROM student_quran_plans
          WHERE student_id = ? AND status IN ('active', 'completed') ORDER BY id DESC LIMIT 1`, [studentId]);
        if (!plan || Number(plan.id) !== Number(req.body.currentPlanId)) return res.status(409).json({ message: 'تغيّرت خطة الطالب. أعد فتحها.' });
        if (plan.track !== 'memorization') return res.status(422).json({ message: 'الخطط التلقائية مخصصة لمسار الحفظ.' });
        current = plan;
      }
      if (req.body.priorMemorization !== undefined && (!Array.isArray(req.body.priorMemorization) || req.body.priorMemorization.length > 100)) return res.status(422).json({ message: 'المحفوظ المجتاز غير صحيح.' });
      const ranges = req.body.ranges ?? (await loadAutomaticTemplate(db())).template.ranges;
      res.set('Cache-Control', 'no-store').json(await prepareAutomaticRanges(db(), {
        studentId, ranges, current, priorMemorization: req.body.priorMemorization || [],
      }));
    } catch (error) { next(error); }
  });
  return router;
}
