import { assertSessionStarted, currentSessionWeek, sessionPeriod } from '../../shared/session-period.js';
import { activeTrackCompensation } from '../services/compensatedGradeGuard.js';
import { loadEligibleCompensationDays } from '../services/compensationEligibility.js';
import { recordDayCompensation, approveCompensationExcuse, cancelDayCompensation } from '../services/dayCompensations.js';
import { gradingPermissionForComponent, scopeSessionGrade } from '../../shared/dashboard-permissions.js';
import express from 'express';
import { loadSeasonalHolidays } from '../services/seasonalHolidays.js';
import { isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { assertGradeDate } from '../services/gradeDateBoundary.js';
import { currentQuranPlanSql } from '../services/currentQuranPlan.js';
import { ATTENDANCE_GRADE_STATUSES, gradingMaxima } from '../../shared/grading-policy.js';
import { canTestSession, sessionAttendanceStatus } from '../../shared/session-attendance.js';
import { createTrackTestAttempts } from '../services/trackTestSegments.js';
import {
  addDays,
  computeStudentsWeeklyGrades,
  deleteWeeklyComponent,
  isGradingDate,
  loadGradingPolicy,
  loadGradingPolicyForDate,
  loadRecordedSessionDays,
  loadSessionDay,
  recordWeeklyComponent,
  saveGradingPolicy,
  weekDates,
  weekStartOf,
} from '../services/grading.js';
import { getSupervisorDashboardPermissions, hasSupervisorDashboardPermission, permissionDenied } from '../services/dashboardPermissions.js';

const WEEKLY_COMPONENTS = new Set(['track', 'weekly']);
const STAFF_ROLES = new Set(['manager', 'admin', 'supervisor']);

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
    hesitations: Number(item?.hesitations ?? 0),
    recorded: item?.recorded !== false,
  }));
}

/**
 * Grades of the new weekly model: settings, per-week records and results.
 * Dashboard pages only: the manager and staff granted the matching session permission.
 */
export function createGradingRouter({ db, today }) {
  const router = express.Router();
  const attempts = createTrackTestAttempts();

  const isStaff = req => STAFF_ROLES.has(req.auth?.role);

  async function canManagePolicy(req) {
    if (req.auth?.role === 'manager') return true;
    if (!['admin', 'supervisor'].includes(req.auth?.role)) return false;
    return hasSupervisorDashboardPermission(req.auth.id, ['settings']);
  }

  /** Students the account may grade, optionally limited to one circle. */
  async function scopedStudents(req, committeeId = null) {
    const filters = [];
    const values = [];
    if (req.auth?.role === 'supervisor') {
      filters.push('EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?)');
      values.push(req.auth.id);
    }
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

  const requireStaff = async (req, res, next) => {
    try {
      if (!isStaff(req)) return permissionDenied(res);
      if (req.auth.role === 'manager' || await hasSupervisorDashboardPermission(req.auth.id, ['settings', 'quranEvaluation', 'weeklySession', 'trackSession'])) return next();
      return permissionDenied(res);
    } catch (error) { return next(error); }
  };

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
      const policy = await saveGradingPolicy(db(), req.body.policy);
      return res.json({ policy, maxima: gradingMaxima(policy) });
    } catch (error) { return next(error); }
  });

  router.get('/week', requireStaff, async (req, res, next) => {
    try {
      const component = req.query.component;
      if (component !== undefined && !WEEKLY_COMPONENTS.has(component)) return invalid(res, 'نوع الجلسة غير صحيح.');
      const currentPolicy = await loadGradingPolicy(db());
      const section = component === 'track' ? 'trackSession' : 'weeklySession';
      const currentWeekStart = component ? currentSessionWeek(today(), currentPolicy[section].sessionDay) : weekStartOf(today());
      const requested = String(req.query.weekStart || currentWeekStart);
      if (!isGradingDate(requested)) return invalid(res, 'تاريخ الأسبوع غير صحيح.');
      const weekStart = weekStartOf(requested);
      const permissions = req.auth.role === 'manager' ? ['weeklySession', 'trackSession'] : await getSupervisorDashboardPermissions(req.auth.id);
      if (!permissions.some(key => ['quranEvaluation', 'weeklySession', 'trackSession'].includes(key))) return permissionDenied(res);
      const committeeId = req.query.committeeId ? positiveId(req.query.committeeId) : null;
      const students = await scopedStudents(req, committeeId);
      const studentIds = students.map(student => student.id);
      const sessionDays = component ? await loadRecordedSessionDays(db(), { studentIds, component }) : {};
      const eligible = {};
      for (const scope of ['track', 'program']) {
        if (scope === 'track' ? permissions.includes('trackSession') : permissions.some(key => ['quranEvaluation', 'weeklySession'].includes(key))) {
          eligible[scope] = await loadEligibleCompensationDays(db(), { studentIds, scope, today: today() });
        }
      }
      const grades = await computeStudentsWeeklyGrades(db(), { studentIds, weekStart, today: today() });
      const [compensations] = studentIds.length
        ? await db().query(`SELECT id, student_id AS studentId, DATE_FORMAT(compensated_date, '%Y-%m-%d') AS date,
          scope, cancelled_at AS cancelledAt, cancelled_by_name AS cancelledByName, cancellation_reason AS cancellationReason, actor_name AS actorName, DATE_FORMAT(recorded_at, '%Y-%m-%dT%H:%i:%s') AS recordedAt, excuse_reference AS excuseReference
          FROM student_day_compensations WHERE student_id IN (?) AND compensated_date BETWEEN ? AND ? ORDER BY compensated_date`, [studentIds, weekStart, addDays(weekStart, 6)]) : [[]];
      const [first] = grades.values();
      const policy = await loadGradingPolicyForDate(db(), weekStart, { freeze: false });
      const sessionDay = component ? sessionDays[weekStart] ?? currentPolicy[section].sessionDay ?? 0 : null;
      const period = component ? sessionPeriod(weekStart, sessionDay) : { start: weekStart, end: addDays(weekStart, 6) };
      const holidays = await loadSeasonalHolidays(db());
      res.set('Cache-Control', 'no-store').json({
        weekStart,
        currentWeekStart,
        periodStart: period.start,
        periodEnd: period.end,
        sessionDay,
        currentSessionDay: component ? currentPolicy[section].sessionDay ?? 0 : null,
        sessionDays,
        canManageCompensations: await canManagePolicy(req),
        seasonalHoliday: weekDates(period.start).every(date => isSeasonalHoliday(date, holidays)),
        policy,
        weekEnd: addDays(weekStart, 6),
        dates: weekDates(weekStart),
        hasPreviousWeek: await hasEarlierGradingWeek(studentIds, weekStart),
        maxima: first?.maxima || gradingMaxima(policy),
        students: students.map(student => ({ ...student, compensationDays: Object.fromEntries(Object.entries(eligible).map(([scope, days]) => [scope, days.get(student.id) || []])), compensations: compensations.filter(row => Number(row.studentId) === student.id
          && (row.scope === 'track' ? permissions.includes('trackSession') : permissions.some(key => ['quranEvaluation', 'weeklySession'].includes(key)))), grade: scopeSessionGrade(grades.get(student.id), permissions) })),
      });
    } catch (error) { next(error); }
  });

  router.post('/track-test', requireStaff, async (req, res, next) => {
    try {
      if (req.auth.role !== 'manager' && !await hasSupervisorDashboardPermission(req.auth.id, 'trackSession')) return permissionDenied(res);
      const studentId = positiveId(req.body?.studentId);
      const requested = String(req.body?.weekStart || '');
      if (!studentId || !isGradingDate(requested)) return invalid(res, 'بيانات الاختبار غير صحيحة.');
      const weekStart = weekStartOf(requested);
      if (weekStart > today()) return invalid(res, 'لا يمكن التسجيل لأسبوع لم يبدأ بعد.');
      if (!await studentInScope(req, studentId)) return permissionDenied(res);
      const currentPolicy = await loadGradingPolicy(db());
      const sessionDay = await loadSessionDay(db(), { studentId, weekStart, component: 'track', currentPolicy });
      assertSessionStarted(weekStart, sessionDay, today());
      await assertGradeDate(db(), studentId, weekStart, { weekly: true, today: today(), periodStart: sessionPeriod(weekStart, sessionDay).start });
      const policy = await loadGradingPolicyForDate(db(), weekStart);
      if (await activeTrackCompensation(db(), studentId, weekStart)) throw Object.assign(new Error('ألغِ التعويض إداريًا قبل الاختبار.'), { status: 409 });
      const result = await attempts.prepare(db(), { studentId, weekStart, today: today(), policy, auth: req.auth });
      return res.set('Cache-Control', 'no-store').json(result);
    } catch (error) { return next(error); }
  });

  for (const [path, scope, permission] of [['/track-compensation', 'track', 'trackSession'], ['/program-compensation', 'program', ['quranEvaluation', 'weeklySession']]]) {
    router.get(`${path}-days`, requireStaff, async (req, res, next) => {
      try {
        if (req.auth.role !== 'manager' && !await hasSupervisorDashboardPermission(req.auth.id, permission)) return permissionDenied(res);
        const studentId = positiveId(req.query.studentId);
        if (!studentId || !await studentInScope(req, studentId)) return permissionDenied(res);
        const days = await loadEligibleCompensationDays(db(), { studentIds: [studentId], scope, today: today() });
        return res.set('Cache-Control', 'no-store').json({ days: days.get(studentId) || [] });
      } catch (error) { return next(error); }
    });
    router.post(path, requireStaff, async (req, res, next) => {
      let connection;
      try {
        if (req.auth.role !== 'manager' && !await hasSupervisorDashboardPermission(req.auth.id, permission)) return permissionDenied(res);
        const studentId = positiveId(req.body?.studentId), date = String(req.body?.date || '');
        if (!studentId || !isGradingDate(date)) return invalid(res, 'حدد الطالب واليوم المراد تعويضه.');
        if (!await studentInScope(req, studentId)) return permissionDenied(res);
        connection = await db().getConnection();
        await connection.beginTransaction();
        const result = await recordDayCompensation(connection, { studentId, date, today: today(), actor: req.auth, scope, excuseReference: req.body.excuseReference });
        await connection.commit();
        return res.status(201).json({ ok: true, result });
      } catch (error) { if (connection) await connection.rollback(); return next(error); }
      finally { connection?.release(); }
    });
  }

  router.post('/excuse-approval', requireStaff, async (req, res, next) => {
    let connection;
    try {
      if (!await canManagePolicy(req)) return permissionDenied(res);
      const studentId = positiveId(req.body?.studentId), date = String(req.body?.date || '');
      if (!studentId || !isGradingDate(date)) return invalid(res, 'حدد الطالب وتاريخ الاستئذان.');
      if (!await studentInScope(req, studentId)) return permissionDenied(res);
      connection = await db().getConnection(); await connection.beginTransaction();
      await approveCompensationExcuse(connection, { studentId, date, today: today(), actor: req.auth, excuseReference: req.body.excuseReference });
      await connection.commit(); return res.status(201).json({ ok: true });
    } catch (error) { if (connection) await connection.rollback(); return next(error); }
    finally { connection?.release(); }
  });

  router.post('/compensations/:id/cancel', requireStaff, async (req, res, next) => {
    let connection;
    try {
      if (!await canManagePolicy(req)) return permissionDenied(res);
      const id = positiveId(req.params.id);
      const [[row]] = await db().query('SELECT student_id AS studentId FROM student_day_compensations WHERE id = ?', [id || 0]);
      if (!row || !await studentInScope(req, Number(row.studentId))) return permissionDenied(res);
      connection = await db().getConnection(); await connection.beginTransaction();
      const result = await cancelDayCompensation(connection, { id, actor: req.auth, reason: req.body.reason });
      await connection.commit(); return res.json({ ok: true, result });
    } catch (error) { if (connection) await connection.rollback(); return next(error); }
    finally { connection?.release(); }
  });

  router.put('/weekly-component', requireStaff, async (req, res, next) => {
    try {
      const studentId = positiveId(req.body?.studentId);
      const requested = String(req.body?.weekStart || '');
      const component = String(req.body?.component || '');
      if (!studentId || !isGradingDate(requested) || !WEEKLY_COMPONENTS.has(component)) {
        return invalid(res, 'بيانات الجلسة غير صحيحة.');
      }
      if (req.auth.role !== 'manager' && !await hasSupervisorDashboardPermission(req.auth.id, gradingPermissionForComponent(component))) return permissionDenied(res);
      const weekStart = weekStartOf(requested);
      if (weekStart > today()) return invalid(res, 'لا يمكن التسجيل لأسبوع لم يبدأ بعد.');
      if (!await studentInScope(req, studentId)) return permissionDenied(res);
      const currentPolicy = await loadGradingPolicy(db());
      const sessionDay = await loadSessionDay(db(), { studentId, weekStart, component, currentPolicy });
      assertSessionStarted(weekStart, sessionDay, today());
      await assertGradeDate(db(), studentId, weekStart, { weekly: true, today: today(), periodStart: sessionPeriod(weekStart, sessionDay).start });
      const actor = { role: req.auth.role, id: req.auth.id, name: req.auth.name };
      if (req.body.attendanceStatus !== undefined && !ATTENDANCE_GRADE_STATUSES.includes(req.body.attendanceStatus)) return invalid(res, 'حالة الحضور غير صحيحة.');
      if (req.body.attendanceStatus === undefined && req.body.attended !== null && typeof req.body.attended !== 'boolean') return invalid(res, 'حالة الحضور غير صحيحة.');
      if (req.body.attendanceStatus === undefined && req.body.attended === null) {
        await deleteWeeklyComponent(db(), { studentId, weekStart, component, actor });
        return res.json({ ok: true, result: null });
      }
      const attendanceStatus = sessionAttendanceStatus({ attendanceStatus: req.body.attendanceStatus, attended: req.body.attended });
      const attended = canTestSession({ attendanceStatus });
      let segments = component === 'track' ? normalizeSegments(req.body.segments) : [];
      if (segments.some(item => !Number.isInteger(item.hesitations) || item.hesitations < 0 || item.hesitations > 1000)) return invalid(res, 'عدد الترددات يجب أن يكون عددًا صحيحًا من 0 إلى 1000.');
      if (component === 'track' && !attended && (req.body.attemptToken || segments.some(item => item.recorded))) return invalid(res, 'الاختبار متاح للحاضر والمتأخر فقط.');
      if (component === 'track') {
        const policy = await loadGradingPolicyForDate(db(), weekStart);
        // Missing rows are pending, never a perfect test by default.
        segments = Array.from({ length: policy.trackSession.segmentCount }, (_, index) => segments[index] || { range: null, mistakes: 0, warnings: 0, hesitations: 0, recorded: false });
      }
      if (component === 'track' && (req.body.attemptToken || segments.some(item => item.recorded)) && await activeTrackCompensation(db(), studentId, weekStart)) throw Object.assign(new Error('ألغِ التعويض إداريًا قبل الاختبار.'), { status: 409 });
      if (component === 'track' && attended && segments.some(item => item.recorded)) {
        const policy = await loadGradingPolicyForDate(db(), weekStart);
        if (req.body.attemptToken) segments = attempts.verify(req.body.attemptToken, { studentId, weekStart, policy, auth: req.auth, segments });
        else if (policy.trackSession.segments) {
          // An attendance-only update may retain the exact already-saved evaluation.
          const [[stored]] = await db().query("SELECT detail_json AS detail FROM student_weekly_components WHERE student_id = ? AND week_start = ? AND component = 'track'", [studentId, weekStart]);
          const detail = typeof stored?.detail === 'string' ? JSON.parse(stored.detail) : stored?.detail;
          if (!detail?.attended || JSON.stringify(normalizeSegments(detail.segments)) !== JSON.stringify(segments)) return invalid(res, 'افتح الاختبار لاختيار المقاطع قبل تسجيل الدرجات.');
        }
      }
      const result = await recordWeeklyComponent(db(), {
        studentId,
        weekStart,
        component,
        attended,
        attendanceStatus,
        segments,
        actor,
      });
      return res.json({ ok: true, result });
    } catch (error) { return next(error); }
  });

  return router;
}
