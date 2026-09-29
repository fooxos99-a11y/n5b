import express from 'express';
import { assertGradeDate } from '../services/gradeDateBoundary.js';
import { currentQuranPlanSql } from '../services/currentQuranPlan.js';
import { gradingMaxima, normalizeGradingPolicy } from '../../shared/grading-policy.js';
import {
  addDays,
  computeStudentsWeeklyGrades,
  deleteWeeklyComponent,
  isGradingDate,
  loadGradingPolicy,
  loadGradingPolicyForDate,
  recordWeeklyComponent,
  saveGradingPolicy,
  weekDates,
  weekStartOf,
} from '../services/grading.js';
import { hasSupervisorDashboardPermission, permissionDenied } from '../services/dashboardPermissions.js';

const WEEKLY_COMPONENTS = new Set(['track', 'weekly']);
const STAFF_ROLES = new Set(['manager', 'admin']);

const invalid = (res, message) => res.status(422).json({ message });
const positiveId = value => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

function normalizeSegmentRange(range) {
  if (!range || typeof range !== 'object') return null;
  const values = ['fromSurah', 'fromAyah', 'toSurah', 'toAyah'].map(key => positiveId(range[key]));
  if (values.some(value => !value)) return null;
  const [fromSurah, fromAyah, toSurah, toAyah] = values;
  if (fromSurah > 114 || toSurah > 114) return null;
  return { fromSurah, fromAyah, toSurah, toAyah };
}

function normalizeSegments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(item => ({
    range: normalizeSegmentRange(item?.range),
    mistakes: Math.max(0, Math.min(1000, Math.floor(Number(item?.mistakes) || 0))),
    warnings: Math.max(0, Math.min(1000, Math.floor(Number(item?.warnings) || 0))),
    recorded: item?.recorded !== false,
  }));
}

/**
 * Grades of the new weekly model: settings, per-week records and results.
 * Dashboard pages only: the manager and administrators granted the grades permission.
 */
export function createGradingRouter({ db, today }) {
  const router = express.Router();

  const isStaff = req => STAFF_ROLES.has(req.auth?.role);

  async function canManagePolicy(req) {
    if (req.auth?.role === 'manager') return true;
    if (req.auth?.role !== 'admin') return false;
    return hasSupervisorDashboardPermission(req.auth.id, ['settings']);
  }

  /** Students the account may grade, optionally limited to one circle. */
  async function scopedStudents(req, committeeId = null) {
    const filters = [];
    const values = [];
    if (committeeId) {
      filters.push('s.committee_id = ?');
      values.push(committeeId);
    }
    const [rows] = await db().query(
      `SELECT s.id, s.name, s.login_number AS loginNumber, s.committee_id AS committeeId, c.name AS committeeName,
         (SELECT p.reading_faces FROM student_quran_plans p WHERE p.student_id = s.id AND ${currentQuranPlanSql('p')}
          ORDER BY p.id DESC LIMIT 1) AS readingFaces
       FROM students s
       LEFT JOIN committees c ON c.id = s.committee_id
       ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
       ORDER BY c.name, s.name`,
      values,
    );
    return rows.map(row => ({
      id: Number(row.id),
      name: row.name,
      loginNumber: row.loginNumber,
      committeeId: row.committeeId ? Number(row.committeeId) : null,
      committeeName: row.committeeName || '',
      readingFaces: row.readingFaces === null || row.readingFaces === undefined ? null : Number(row.readingFaces),
    }));
  }

  async function studentInScope(req, studentId) {
    const students = await scopedStudents(req);
    return students.find(student => student.id === studentId) || null;
  }

  const requireStaff = (req, res, next) => (isStaff(req) ? next() : permissionDenied(res));

  /** A week before `weekStart` is worth opening only if a plan had started or a session was recorded by then. */
  async function hasEarlierGradingWeek(studentIds, weekStart) {
    if (!studentIds.length) return false;
    const [[row]] = await db().query(
      `SELECT (
         EXISTS (SELECT 1 FROM student_quran_plans p WHERE p.student_id IN (?) AND p.start_date < ?)
         OR EXISTS (SELECT 1 FROM student_weekly_components w WHERE w.student_id IN (?) AND w.week_start < ?)
       ) AS found`,
      [studentIds, weekStart, studentIds, weekStart],
    );
    return Boolean(Number(row?.found));
  }

  router.get('/policy', requireStaff, async (_req, res, next) => {
    try {
      const policy = await loadGradingPolicy(db());
      res.json({ policy, maxima: gradingMaxima(policy) });
    } catch (error) { next(error); }
  });

  router.put('/policy', async (req, res, next) => {
    try {
      if (!await canManagePolicy(req)) return permissionDenied(res);
      if (!req.body?.policy || typeof req.body.policy !== 'object') return invalid(res, 'بيانات إعدادات الدرجات غير صحيحة.');
      const policy = await saveGradingPolicy(db(), normalizeGradingPolicy(req.body.policy));
      return res.json({ policy, maxima: gradingMaxima(policy) });
    } catch (error) { return next(error); }
  });

  router.get('/week', requireStaff, async (req, res, next) => {
    try {
      const requested = String(req.query.weekStart || today());
      if (!isGradingDate(requested)) return invalid(res, 'تاريخ الأسبوع غير صحيح.');
      const weekStart = weekStartOf(requested);
      const committeeId = req.query.committeeId ? positiveId(req.query.committeeId) : null;
      const students = await scopedStudents(req, committeeId);
      const studentIds = students.map(student => student.id);
      const grades = await computeStudentsWeeklyGrades(db(), { studentIds, weekStart });
      const [first] = grades.values();
      const policy = await loadGradingPolicyForDate(db(), weekStart, { freeze: false });
      res.set('Cache-Control', 'no-store').json({
        weekStart,
        policy,
        weekEnd: addDays(weekStart, 6),
        dates: weekDates(weekStart),
        hasPreviousWeek: await hasEarlierGradingWeek(studentIds, weekStart),
        maxima: first?.maxima || gradingMaxima(policy),
        students: students.map(student => ({ ...student, grade: grades.get(student.id) || null })),
      });
    } catch (error) { next(error); }
  });

  router.put('/weekly-component', requireStaff, async (req, res, next) => {
    try {
      const studentId = positiveId(req.body?.studentId);
      const requested = String(req.body?.weekStart || '');
      const component = String(req.body?.component || '');
      if (!studentId || !isGradingDate(requested) || !WEEKLY_COMPONENTS.has(component)) {
        return invalid(res, 'بيانات الجلسة غير صحيحة.');
      }
      const weekStart = weekStartOf(requested);
      if (weekStart > today()) return invalid(res, 'لا يمكن التسجيل لأسبوع لم يبدأ بعد.');
      if (!await studentInScope(req, studentId)) return permissionDenied(res);
      await assertGradeDate(db(), studentId, weekStart, { weekly: true, today: today() });
      const actor = { role: req.auth.role, id: req.auth.id, name: req.auth.name };
      if (req.body.attended === null) {
        await deleteWeeklyComponent(db(), { studentId, weekStart, component, actor });
        return res.json({ ok: true, result: null });
      }
      const segments = component === 'track' ? normalizeSegments(req.body.segments) : [];
      const result = await recordWeeklyComponent(db(), {
        studentId,
        weekStart,
        component,
        attended: req.body.attended === true,
        segments,
        actor,
      });
      return res.json({ ok: true, result });
    } catch (error) { return next(error); }
  });

  return router;
}
