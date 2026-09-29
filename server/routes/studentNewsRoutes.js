import express from 'express';
import { db as defaultDb } from '../db.js';
import { requirePermission } from '../services/dashboardPermissions.js';
import { emptyStudentNews, visibleStudentNews, upgradeStudentNews, newsTimeNow } from '../../shared/student-news.js';
import { normalizeStudentNews, removeDeletedNewsCommittees } from '../services/studentNews.js';

export function createStudentNewsRouter({ getNow = newsTimeNow, db = defaultDb }) {
  const router = express.Router();
  const management = (req, res, next) => {
    if (!['admin', 'manager'].includes(req.auth?.role)) return res.status(403).json({ message: 'غير مصرح.' });
    return requirePermission('settings')(req, res, next);
  };
  const load = async () => {
    const [[row]] = await db().query('SELECT content, revision FROM student_news WHERE id = 1');
    return { ...emptyStudentNews(), ...upgradeStudentNews(JSON.parse(row?.content || '{}')), revision: Number(row?.revision || 0) };
  };
  router.get('/manage', management, async (_req, res, next) => {
    try {
      const content = await load();
      const [committees] = await db().query('SELECT id FROM committees');
      res.set('Cache-Control', 'no-store').json(removeDeletedNewsCommittees(content, committees.map(row => row.id)));
    } catch (error) { next(error); }
  });
  router.get('/audience', management, async (_req, res, next) => {
    try {
      const [committees] = await db().query('SELECT id, name FROM committees ORDER BY name');
      res.json(committees);
    } catch (error) { next(error); }
  });
  router.put('/manage', management, async (req, res, next) => {
    try {
      const current = await load();
      if (current.revision !== req.body.revision) return res.status(409).json({ message: 'تغيرت الأخبار من مستخدم آخر؛ أعد تحميلها قبل الحفظ.' });
      const content = await normalizeStudentNews(req.body, current.entries);
      const committeeIds = [...new Set(content.entries.flatMap(entry => entry.committeeIds))];
      if (committeeIds.length) {
        const [rows] = await db().query('SELECT id FROM committees WHERE id IN (?)', [committeeIds]);
        if (rows.length !== committeeIds.length) return res.status(422).json({ message: 'بعض الحلقات غير موجودة؛ أعد تحميل القائمة.' });
      }
      const [result] = await db().query('UPDATE student_news SET content = ?, revision = revision + 1 WHERE id = 1 AND revision = ?', [JSON.stringify(content), req.body.revision]);
      if (!result.affectedRows) return res.status(409).json({ message: 'تغيرت الأخبار من مستخدم آخر؛ أعد تحميلها قبل الحفظ.' });
      res.json({ ...content, revision: req.body.revision + 1 });
    } catch (error) { next(error); }
  });
  router.get('/', async (req, res, next) => {
    if (req.auth?.role !== 'student') return res.status(403).json({ message: 'غير مصرح.' });
    try {
      const [[student]] = await db().query('SELECT id, committee_id AS committeeId FROM students WHERE id = ?', [req.auth.id]);
      if (!student) return res.status(404).json({ message: 'حساب الطالب غير موجود.' });
      res.set('Cache-Control', 'no-store').json(visibleStudentNews(await load(), student, getNow()));
    }
    catch (error) { next(error); }
  });
  return router;
}
