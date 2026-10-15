import express from 'express';
import { buildNarrationStudentPreparation, loadNarrationPreparationStudents, prepareNarrationAssignments } from '../services/narrationPreparation.js';

/** Read-only event preparation; authorization and Quran calculations are shared with creation. */
export function createNarrationPreparationRouter({ db, requireAccess, isDate, ensureCommitteeIds, canAccessCommittee,
  rangeDependencies, loadMemorizedRanges, mergeRanges, loadJuzRanges, loadChapters, loadClientJuzRanges, collectParts, nextDate }) {
  const router = express.Router();
  router.get('/preparation-references', requireAccess, async (_req, res, next) => {
    try {
      const [chapters, juzRanges] = await Promise.all([loadChapters(db()), loadClientJuzRanges(db())]);
      res.set('Cache-Control', 'no-store').json({ chapters, juzRanges });
    } catch (error) { next(error); }
  });
  router.post('/preparation-preview', requireAccess, async (req, res, next) => {
    let connection;
    try {
      const name = String(req.body?.name || '').trim().slice(0, 180);
      const startDate = String(req.body?.startDate || ''), endDate = String(req.body?.endDate || '');
      const scope = req.body?.scope === 'committee' ? 'committee' : 'all';
      const requestedIds = scope === 'committee' ? Array.isArray(req.body?.committeeIds) ? req.body.committeeIds : [req.body?.committeeId] : [];
      const committeeIds = [...new Set(requestedIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
      if (!name || !isDate(startDate) || !isDate(endDate) || startDate > endDate || committeeIds.length > 1000 || (scope === 'committee' && !committeeIds.length))
        return res.status(422).json({ message: 'بيانات يوم السرد غير مكتملة.' });
      connection = await db().getConnection();
      if (scope === 'committee') await ensureCommitteeIds(connection, committeeIds);
      if (req.auth.role === 'supervisor' && !(await Promise.all(committeeIds.map(id => canAccessCommittee(req.auth, id)))).every(Boolean))
        return res.status(403).json({ message: 'اختر إحدى حلقاتك لإنشاء يوم السرد.' });
      const students = await loadNarrationPreparationStudents(connection, req.auth, committeeIds);
      const assignments = await prepareNarrationAssignments(req.body?.mode, req.body?.assignments, students, rangeDependencies(connection));
      const juzRanges = await loadJuzRanges(connection);
      const prepared = await buildNarrationStudentPreparation({ students, assignments, startDate }, {
        loadMemorizedRanges: (id, filters) => loadMemorizedRanges(connection, id, filters),
        mergeRanges: ranges => mergeRanges(connection, ranges),
        collectParts: async ranges => { const parts = []; await collectParts(ranges, juzRanges, parts, connection); return parts; },
        nextDate,
      });
      return res.set('Cache-Control', 'no-store').json({ mode: assignments ? 'manual' : 'full', startDate, endDate, scope, committeeIds, ...prepared });
    } catch (error) { return next(error); }
    finally { connection?.release(); }
  });
  return router;
}
