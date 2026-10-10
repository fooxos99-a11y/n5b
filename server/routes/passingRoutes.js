import express from 'express';
import { requirePermission } from '../services/dashboardPermissions.js';
import { assertSupervisorStudentScope } from '../services/supervisorStudentScope.js';
import { loadPassingPolicy, savePassingPolicy, createPassingExam, loadPassingExam, recordPassingAttempt } from '../services/passing.js';
import { decidePassingRehifz } from '../services/passingRehifz.js';
import { loadEligiblePassingParts } from '../services/passingEligibility.js';

const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
export function createPassingRouter({ db, loadMemorizedRanges, loadAyahs, buildMushafData, normalizeMarks }) {
  const router = express.Router();
  const access = requirePermission('quranPassing');
  const assertStudent = async (req, id) => {
    if (!positiveId(id)) throw Object.assign(new Error('معرّف الطالب غير صحيح.'), { status: 422 });
    await assertSupervisorStudentScope(db(), req.auth, { studentId: Number(id) });
  };
  router.get('/policy', requirePermission(['quranPassing', 'settings']), async (req, res, next) => {
    try { res.set('Cache-Control', 'no-store').json({ policy: await loadPassingPolicy(db()) }); } catch (error) { next(error); }
  });
  router.put('/policy', requirePermission('settings'), async (req, res, next) => {
    try { res.json({ policy: await savePassingPolicy(db(), req.body?.policy) }); } catch (error) { next(error); }
  });
  router.get('/students', access, async (req, res, next) => {
    try {
      const supervisor = req.auth.role === 'supervisor';
      const [students] = await db().query(`SELECT s.id, s.name, c.id AS committeeId, c.name AS committeeName, x.id AS complexId, x.name AS complexName
        FROM students s LEFT JOIN committees c ON c.id = s.committee_id LEFT JOIN complexes x ON x.id=c.complex_id
        ${supervisor ? 'WHERE EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?)' : ''} ORDER BY c.name, s.name`, supervisor ? [req.auth.id] : []);
      res.set('Cache-Control', 'no-store').json(students);
    } catch (error) { next(error); }
  });
  router.get('/students/:studentId/parts', access, async (req, res, next) => {
    try {
      const studentId = positiveId(req.params.studentId);
      await assertStudent(req, studentId);
      const [[student]] = await db().query('SELECT id FROM students WHERE id=?', [studentId]);
      if (!student) throw Object.assign(new Error('الطالب غير موجود.'), { status: 404 });
      const parts = await loadEligiblePassingParts(db(), { studentId, type: req.query.type, loadMemorizedRanges, loadAyahs });
      const [rows] = await db().query('SELECT id FROM student_passing_exams WHERE student_id=? AND exam_type=? ORDER BY id DESC', [studentId, req.query.type]);
      const exams = await Promise.all(rows.map(row => loadPassingExam(db(), row.id)));
      res.set('Cache-Control', 'no-store').json({ parts, exams });
    } catch (error) { next(error); }
  });
  router.get('/', access, async (req, res, next) => {
    try {
      if (!['branch', 'hafiz'].includes(req.query.type)) throw Object.assign(new Error('نوع الاجتياز غير صحيح.'), { status: 422 });
      const supervisor = req.auth.role === 'supervisor';
      const [exams] = await db().query(`SELECT e.id FROM student_passing_exams e JOIN students s ON s.id = e.student_id
        WHERE e.exam_type = ? ${supervisor ? 'AND EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?)' : ''}
        ORDER BY e.id DESC LIMIT 200`, [req.query.type, ...(supervisor ? [req.auth.id] : [])]);
      res.set('Cache-Control', 'no-store').json(await Promise.all(exams.map(exam => loadPassingExam(db(), exam.id))));
    } catch (error) { next(error); }
  });
  router.post('/', access, async (req, res, next) => {
    try {
      const studentId = positiveId(req.body?.studentId);
      await assertStudent(req, studentId);
      const id = await createPassingExam(db(), { studentId, type: req.body.type, juz: req.body.juz, actor: req.auth, loadMemorizedRanges, loadAyahs });
      res.status(201).json(await loadPassingExam(db(), id));
    } catch (error) { next(error); }
  });
  const assertPart = async (req, partId) => {
    const [[part]] = await db().query(`SELECT e.student_id AS studentId, p.ranges_json AS ranges FROM student_passing_parts p JOIN student_passing_exams e ON e.id = p.exam_id WHERE p.id = ?`, [positiveId(partId)]);
    if (!part) throw Object.assign(new Error('الجزء غير موجود.'), { status: 404 });
    await assertStudent(req, part.studentId);
    return part;
  };
  router.get('/parts/:partId/segments/:index/mushaf', access, async (req, res, next) => {
    try {
      const part = await assertPart(req, req.params.partId);
      const ranges = typeof part.ranges === 'string' ? JSON.parse(part.ranges) : part.ranges;
      const index = Number(req.params.index);
      if (!Number.isInteger(index) || index < 0 || !ranges[index]) throw Object.assign(new Error('المقطع غير موجود.'), { status: 404 });
      res.set('Cache-Control', 'no-store').json(await buildMushafData(db(), ranges[index]));
    } catch (error) { next(error); }
  });
  router.post('/parts/:partId/attempts', access, async (req, res, next) => {
    try {
      await assertPart(req, req.params.partId);
      const result = await recordPassingAttempt(db(), { partId: positiveId(req.params.partId), body: req.body || {}, actor: req.auth, normalizeMarks });
      res.json({ ok: true, result });
    } catch (error) { next(error); }
  });
  router.post('/parts/:partId/rehifz', access, (req, res, next) => req.body?.repeat === true
    ? requirePermission('studentPlans')(req, res, next) : next(), async (req, res, next) => {
    try {
      const decision = await decidePassingRehifz(db(), { partId: positiveId(req.params.partId),
        attemptId: req.body?.attemptId, repeat: req.body?.repeat, actor: req.auth });
      res.json({ ok: true, ...decision });
    } catch (error) { next(error); }
  });
  return router;
}
