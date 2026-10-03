import { quranRangeFacesSql, acceptedQuranExecutionSql } from './quranFaceMeasurement.js';
import { db, initDatabase, runWithDatabase } from '../db.js';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';
import { dateOnly, parseDateOnly, shiftHijriDate } from '../../shared/hijri-calendar.js';

const allowedPeriods = new Set([1, 7, 30]);
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const analyticsComparisonShifts = new Map([
  ['day', { days: -1 }],
  ['week', { days: -7 }],
  ['month', { months: -1 }],
  ['3months', { months: -3 }],
  ['6months', { months: -6 }],
  ['9months', { months: -9 }],
  ['year', { months: -12 }],
  ['2years', { months: -24 }],
]);

const saudiDate = getBusinessDate;
const shiftDate = shiftDateOnly;

const shiftComparisonDate = (value, shift) => {
  if (shift.days) return shiftDate(value, shift.days);
  return dateOnly(shiftHijriDate(parseDateOnly(value), shift.months));
};

export const resolveOverviewPeriod = (value) => {
  const days = Number(value);
  const safeDays = allowedPeriods.has(days) ? days : 30;
  const to = saudiDate();
  return { days: safeDays, from: shiftDate(to, -(safeDays - 1)), to };
};

const daysBetween = (from, to) => Math.floor((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000) + 1;
const isValidDateOnly = (value) => {
  if (!dateOnlyPattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const resolveAnalyticsPeriod = ({ from, to, compare } = {}) => {
  const today = saudiDate();
  const safeFrom = String(from || today);
  const safeTo = String(to || today);
  if (!isValidDateOnly(safeFrom) || !isValidDateOnly(safeTo) || safeFrom > safeTo) {
    const error = new Error('نطاق التاريخ غير صحيح.');
    error.status = 422;
    throw error;
  }
  const days = daysBetween(safeFrom, safeTo);
  if (days < 1 || days > 366) {
    const error = new Error('يجب ألا تتجاوز الفترة 366 يومًا.');
    error.status = 422;
    throw error;
  }
  const comparison = String(compare || '');
  if (comparison && !analyticsComparisonShifts.has(comparison)) {
    const error = new Error('فترة المقارنة غير صحيحة.');
    error.status = 422;
    throw error;
  }
  const comparisonShift = analyticsComparisonShifts.get(comparison);
  return {
    from: safeFrom,
    to: safeTo,
    days,
    comparison: comparison || null,
    previous: comparisonShift ? {
      from: shiftComparisonDate(safeFrom, comparisonShift),
      to: shiftComparisonDate(safeTo, comparisonShift),
      days: daysBetween(shiftComparisonDate(safeFrom, comparisonShift), shiftComparisonDate(safeTo, comparisonShift)),
    } : null,
  };
};

const emptyAnalyticsStats = () => ({
  studentsCount: 0,
  activeStudentsCount: 0,
  newStudentsCount: 0,
  committeesCount: 0,
  teachersCount: 0,
  averageStudentsPerCommittee: 0,
  averageStudentsPerTeacher: 0,
  attendanceRecords: 0,
  presentCount: 0,
  absentCount: 0,
  lateCount: 0,
  excusedCount: 0,
  attendanceRate: 0,
  absenceRate: 0,
  lateRate: 0,
  averageDailyAttendance: 0,
  tasksCount: 0,
  tasksDone: 0,
  executionRate: 0,
  achievedStudentsCount: 0,
  delayedStudentsCount: 0,
  quranFacesTotal: 0,
  memorizationFaces: 0,
  masteryFaces: 0,
  reviewFaces: 0,
  repeatFaces: 0,
  linkFaces: 0,
  averageStudentAchievement: 0,
  plansCount: 0,
  activePlansCount: 0,
  completedPlansCount: 0,
  pausedPlansCount: 0,
  delayedPlansCount: 0,
  planTargetFaces: 0,
  planCompletedFaces: 0,
  planDueFaces: 0,
  planDueCompletedFaces: 0,
  planProgressRate: 0,
  planAdherenceRate: 0,
});

const round = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));

export const calculatePlanRates = ({ planTargetFaces, planCompletedFaces, planDueFaces, planDueCompletedFaces } = {}) => ({
  planProgressRate: Number(planTargetFaces) ? round(Math.min(100, (Number(planCompletedFaces || 0) / Number(planTargetFaces)) * 100)) : 0,
  planAdherenceRate: Number(planDueFaces) ? round(Math.min(100, (Number(planDueCompletedFaces || 0) / Number(planDueFaces)) * 100)) : 0,
});

const finalizeAnalyticsStats = (value = {}, periodDays = 1) => {
  const stats = Object.fromEntries(Object.keys(emptyAnalyticsStats()).map((key) => [key, Number(value[key] || 0)]));
  Object.assign(stats, calculatePlanRates(stats));
  const attendedCount = stats.presentCount + stats.lateCount + stats.excusedCount;
  stats.attendanceRate = stats.attendanceRecords ? round((attendedCount / stats.attendanceRecords) * 100) : 0;
  stats.absenceRate = stats.attendanceRecords ? round((stats.absentCount / stats.attendanceRecords) * 100) : 0;
  stats.lateRate = stats.attendanceRecords ? round((stats.lateCount / stats.attendanceRecords) * 100) : 0;
  stats.averageDailyAttendance = round(attendedCount / Math.max(1, periodDays));
  stats.executionRate = stats.tasksCount ? round((stats.tasksDone / stats.tasksCount) * 100) : 0;
  stats.averageStudentsPerCommittee = round(stats.studentsCount / Math.max(1, stats.committeesCount));
  stats.averageStudentsPerTeacher = round(stats.studentsCount / Math.max(1, stats.teachersCount));
  stats.averageStudentAchievement = round(stats.quranFacesTotal / Math.max(1, stats.activeStudentsCount));
  return stats;
};

const actualFacesSql = quranRangeFacesSql('t', 'actual');
const accepted = acceptedQuranExecutionSql('t');

const scopedStudents = (alias, scope = {}) => {
  const clauses = [];
  const params = [];
  if (scope.committeeId) { clauses.push(`${alias}.committee_id = ?`); params.push(scope.committeeId); }
  if (scope.teacherId) {
    clauses.push(`EXISTS (SELECT 1 FROM supervisor_committees analytics_sc WHERE analytics_sc.supervisor_id = ? AND analytics_sc.committee_id = ${alias}.committee_id)`);
    params.push(scope.teacherId);
  }
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
};

const scopedCommittees = (alias, scope = {}) => {
  const clauses = [];
  const params = [];
  if (scope.committeeId) { clauses.push(`${alias}.id = ?`); params.push(scope.committeeId); }
  if (scope.teacherId) {
    clauses.push(`EXISTS (SELECT 1 FROM supervisor_committees analytics_sc WHERE analytics_sc.supervisor_id = ? AND analytics_sc.committee_id = ${alias}.id)`);
    params.push(scope.teacherId);
  }
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
};

const scopedTeachers = (alias, scope = {}) => {
  const clauses = [`${alias}.role = 'supervisor'`, `${alias}.is_active = 1`];
  const params = [];
  if (scope.teacherId) { clauses.push(`${alias}.id = ?`); params.push(scope.teacherId); }
  if (scope.committeeId) {
    clauses.push(`EXISTS (SELECT 1 FROM supervisor_committees analytics_sc WHERE analytics_sc.supervisor_id = ${alias}.id AND analytics_sc.committee_id = ?)`);
    params.push(scope.committeeId);
  }
  return { sql: ` WHERE ${clauses.join(' AND ')}`, params };
};

const readAnalyticsStats = async (period, scope = {}) => {
  const studentScope = scopedStudents('s', scope);
  const delayedStudentScope = scopedStudents('delayed_s', scope);
  const committeeScope = scopedCommittees('c', scope);
  const teacherScope = scopedTeachers('sp', scope);
  const [
    [[structure]],
    [[attendance]],
    [[tasks]],
    [[plans]],
  ] = await Promise.all([
    db().query(
      `
      SELECT
        (SELECT COUNT(*) FROM students s WHERE DATE(s.created_at) <= ? ${studentScope.sql}) AS studentsCount,
        (SELECT COUNT(*) FROM committees c ${committeeScope.sql}) AS committeesCount,
        (SELECT COUNT(*) FROM supervisors sp ${teacherScope.sql}) AS teachersCount,
        (SELECT COUNT(*) FROM students s WHERE DATE(s.created_at) BETWEEN ? AND ? ${studentScope.sql}) AS newStudentsCount,
        (SELECT COUNT(*) FROM students s
          WHERE ((s.last_login_at >= CONCAT(?, ' 00:00:00') AND s.last_login_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY))
             OR EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.student_id = s.id AND ar.record_date BETWEEN ? AND ?)
             OR EXISTS (SELECT 1 FROM student_quran_tasks qt WHERE qt.student_id = s.id AND qt.task_date BETWEEN ? AND ?))
          ${studentScope.sql}
        ) AS activeStudentsCount
      `,
      [
        period.to, ...studentScope.params,
        ...committeeScope.params,
        ...teacherScope.params,
        period.from, period.to, ...studentScope.params,
        period.from, period.to, period.from, period.to, period.from, period.to, ...studentScope.params,
      ],
    ),
    db().query(
      `
      SELECT COUNT(*) AS attendanceRecords,
        COALESCE(SUM(status = 'present'), 0) AS presentCount,
        COALESCE(SUM(status = 'absent'), 0) AS absentCount,
        COALESCE(SUM(status = 'late'), 0) AS lateCount,
        COALESCE(SUM(status = 'excused'), 0) AS excusedCount
      FROM attendance_records ar
      JOIN students s ON s.id = ar.student_id
      WHERE ar.record_date BETWEEN ? AND ? ${studentScope.sql}
      `,
      [period.from, period.to, ...studentScope.params],
    ),
    db().query(
      `
      SELECT COUNT(*) AS tasksCount,
        COALESCE(SUM(${accepted}), 0) AS tasksDone,
        COUNT(DISTINCT CASE WHEN ${accepted} THEN student_id END) AS achievedStudentsCount,
        COUNT(DISTINCT CASE WHEN student_status = 'not_done' OR (student_status = 'pending' AND task_date < LEAST(CURDATE(), ?)) THEN student_id END) AS delayedStudentsCount,
        COALESCE(SUM(CASE WHEN t.task_type IN ('memorization','review','link') AND ${accepted} THEN ${actualFacesSql} ELSE 0 END), 0) AS quranFacesTotal,
        COALESCE(SUM(CASE WHEN task_type = 'memorization' AND t.track = 'memorization' AND ${accepted} THEN ${actualFacesSql} ELSE 0 END), 0) AS memorizationFaces,
        COALESCE(SUM(CASE WHEN task_type = 'memorization' AND t.track = 'mastery' AND ${accepted} THEN ${actualFacesSql} ELSE 0 END), 0) AS masteryFaces,
        COALESCE(SUM(CASE WHEN task_type = 'review' AND ${accepted} THEN ${actualFacesSql} ELSE 0 END), 0) AS reviewFaces,
        COALESCE(SUM(CASE WHEN task_type = 'repeat' AND student_status = 'done' THEN ${actualFacesSql} ELSE 0 END), 0) AS repeatFaces,
        COALESCE(SUM(CASE
          WHEN task_type = 'link' AND ${accepted} THEN ${actualFacesSql}
          ELSE 0 END), 0) AS linkFaces
      FROM student_quran_tasks t
      JOIN students s ON s.id = t.student_id
      WHERE t.task_date BETWEEN ? AND ? ${studentScope.sql}
      `,
      [period.to, period.from, period.to, ...studentScope.params],
    ),
    db().query(
      `
      SELECT COUNT(*) AS plansCount,
        COALESCE(SUM(status = 'active'), 0) AS activePlansCount,
        COALESCE(SUM(status = 'completed'), 0) AS completedPlansCount,
        COALESCE(SUM(status = 'paused'), 0) AS pausedPlansCount,
        (SELECT COUNT(DISTINCT delayed_t.plan_id) FROM student_quran_tasks delayed_t
          JOIN students delayed_s ON delayed_s.id = delayed_t.student_id
          WHERE delayed_t.task_date BETWEEN ? AND ? AND (delayed_t.student_status = 'not_done' OR (delayed_t.student_status = 'pending' AND delayed_t.task_date < LEAST(CURDATE(), ?))) ${delayedStudentScope.sql}) AS delayedPlansCount,
        (SELECT COALESCE(SUM(GREATEST(0,
            ABS(progress_p.end_page - progress_p.start_page) + 1
            - COALESCE((SELECT SUM(GREATEST(0,
              LEAST(prior_p.end_page, GREATEST(progress_p.start_page, progress_p.end_page))
              - GREATEST(prior_p.start_page, LEAST(progress_p.start_page, progress_p.end_page)) + 1))
              FROM student_quran_plan_prior_memorization prior_p WHERE prior_p.plan_id = progress_p.id), 0)
          )), 0)
          FROM student_quran_plans progress_p JOIN students s ON s.id = progress_p.student_id
          WHERE progress_p.status IN ('active', 'completed') AND DATE(progress_p.created_at) <= ? ${studentScope.sql}) AS planTargetFaces,
        (SELECT COALESCE(SUM(${quranRangeFacesSql('progress_t', 'actual')}), 0)
          FROM student_quran_tasks progress_t JOIN student_quran_plans progress_p ON progress_p.id = progress_t.plan_id JOIN students s ON s.id = progress_t.student_id
          WHERE progress_p.status IN ('active', 'completed') AND progress_t.task_type = 'memorization' AND progress_t.task_date <= ?
            AND (progress_t.teacher_completed = 1 OR (progress_t.teacher_completed IS NULL AND progress_t.student_status = 'done' AND COALESCE(progress_t.execution_state, '') IN ('complete', 'partial', 'extra'))) ${studentScope.sql}) AS planCompletedFaces,
        (SELECT COALESCE(SUM(${quranRangeFacesSql('due_t', 'expected')}), 0)
          FROM student_quran_tasks due_t JOIN student_quran_plans due_p ON due_p.id = due_t.plan_id JOIN students s ON s.id = due_t.student_id
          WHERE due_p.status IN ('active', 'completed') AND due_t.task_type = 'memorization' AND due_t.task_date <= LEAST(?, CURDATE())
            AND due_t.task_date >= COALESCE(due_p.start_date, DATE(due_p.created_at))
            ${studentScope.sql}) AS planDueFaces,
        (SELECT COALESCE(SUM(CASE WHEN due_t.teacher_completed = 1 OR (due_t.teacher_completed IS NULL AND due_t.student_status = 'done' AND COALESCE(due_t.execution_state, '') IN ('complete', 'partial', 'extra')) THEN ${quranRangeFacesSql('due_t', 'actual')} ELSE 0 END), 0)
          FROM student_quran_tasks due_t JOIN student_quran_plans due_p ON due_p.id = due_t.plan_id JOIN students s ON s.id = due_t.student_id
          WHERE due_p.status IN ('active', 'completed') AND due_t.task_type = 'memorization' AND due_t.task_date <= LEAST(?, CURDATE())
            AND due_t.task_date >= COALESCE(due_p.start_date, DATE(due_p.created_at))
            ${studentScope.sql}) AS planDueCompletedFaces
      FROM student_quran_plans p
      JOIN students s ON s.id = p.student_id
      WHERE DATE(p.created_at) <= ? ${studentScope.sql}
      `,
      [
        period.from, period.to, period.to, ...delayedStudentScope.params,
        period.to, ...studentScope.params,
        period.to, ...studentScope.params,
        period.to, ...studentScope.params,
        period.to, ...studentScope.params,
        period.to, ...studentScope.params,
      ],
    ),
  ]);
  return finalizeAnalyticsStats({ ...structure, ...attendance, ...tasks, ...plans }, period.days);
};

const readAnalyticsTrends = async (period, scope = {}) => {
  const studentScope = scopedStudents('s', scope);
  const [[attendanceRows], [taskRows], [studentRows], [leaderRows]] = await Promise.all([
    db().query(
      `SELECT DATE_FORMAT(record_date, '%Y-%m-%d') AS date,
        COALESCE(SUM(status = 'present'), 0) AS present,
        COALESCE(SUM(status = 'absent'), 0) AS absent,
        COALESCE(SUM(status = 'late'), 0) AS late
      FROM attendance_records ar JOIN students s ON s.id = ar.student_id
      WHERE ar.record_date BETWEEN ? AND ? ${studentScope.sql} GROUP BY ar.record_date ORDER BY ar.record_date`,
      [period.from, period.to, ...studentScope.params],
    ),
    db().query(
      `SELECT DATE_FORMAT(task_date, '%Y-%m-%d') AS date,
        COALESCE(SUM(CASE WHEN task_type = 'memorization' AND t.track = 'memorization' AND ${accepted} THEN ${actualFacesSql} ELSE 0 END), 0) AS memorization,
        COALESCE(SUM(CASE WHEN task_type = 'memorization' AND t.track = 'mastery' AND ${accepted} THEN ${actualFacesSql} ELSE 0 END), 0) AS mastery,
        COALESCE(SUM(CASE WHEN task_type = 'review' AND ${accepted} THEN ${actualFacesSql} ELSE 0 END), 0) AS review,
        COALESCE(SUM(CASE WHEN task_type = 'repeat' AND student_status = 'done' THEN ${actualFacesSql} ELSE 0 END), 0) AS repeatFaces,
        COALESCE(SUM(CASE
          WHEN task_type = 'link' AND ${accepted} THEN ${actualFacesSql}
          ELSE 0 END), 0) AS link
      FROM student_quran_tasks t JOIN students s ON s.id = t.student_id
      WHERE t.task_date BETWEEN ? AND ? ${studentScope.sql} GROUP BY t.task_date ORDER BY t.task_date`,
      [period.from, period.to, ...studentScope.params],
    ),
    db().query(
      `SELECT activity.date, COUNT(DISTINCT activity.studentId) AS active, SUM(activity.isNew) AS newStudents
      FROM (
        SELECT ar.record_date AS date, ar.student_id AS studentId, 0 AS isNew FROM attendance_records ar JOIN students s ON s.id = ar.student_id WHERE ar.record_date BETWEEN ? AND ? ${studentScope.sql}
        UNION ALL SELECT t.task_date, t.student_id, 0 FROM student_quran_tasks t JOIN students s ON s.id = t.student_id WHERE t.task_date BETWEEN ? AND ? ${studentScope.sql}
        UNION ALL SELECT DATE(s.created_at), s.id, 1 FROM students s WHERE DATE(s.created_at) BETWEEN ? AND ? ${studentScope.sql}
      ) activity GROUP BY activity.date ORDER BY activity.date`,
      [period.from, period.to, ...studentScope.params, period.from, period.to, ...studentScope.params, period.from, period.to, ...studentScope.params],
    ),
    db().query(
      `SELECT s.id, s.name, c.name AS committeeName,
        COALESCE(SUM(CASE WHEN t.task_type IN ('memorization','review','link') AND ${accepted} THEN ${actualFacesSql} ELSE 0 END), 0) AS achievedFaces
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      JOIN student_quran_tasks t ON t.student_id = s.id
      WHERE t.task_date BETWEEN ? AND ? ${studentScope.sql}
      GROUP BY s.id, s.name, c.name HAVING achievedFaces > 0
      ORDER BY achievedFaces DESC, s.name ASC LIMIT 5`,
      [period.from, period.to, ...studentScope.params],
    ),
  ]);
  const normalizeRows = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === 'date' || key.endsWith('Name') || key === 'name' ? value : Number(value || 0)])));
  return {
    attendance: normalizeRows(attendanceRows),
    quran: normalizeRows(taskRows),
    students: normalizeRows(studentRows),
    leaders: normalizeRows(leaderRows),
  };
};

const readAnalyticsFilterOptions = async () => {
  const [[committees], [teachers]] = await Promise.all([
    db().query('SELECT id, name FROM committees ORDER BY name'),
    db().query("SELECT id, name FROM supervisors WHERE role = 'supervisor' AND is_active = 1 ORDER BY name"),
  ]);
  return { committees, teachers };
};

export const readComplexAnalytics = async (complex, period, scope = {}, includeFilterOptions = false) => withTenant(complex, async () => {
  const [stats, previousStats, trends, filterOptions] = await Promise.all([
    readAnalyticsStats(period, scope),
    period.previous ? readAnalyticsStats(period.previous, scope) : Promise.resolve(null),
    readAnalyticsTrends(period, scope),
    includeFilterOptions ? readAnalyticsFilterOptions() : Promise.resolve(undefined),
  ]);
  return { available: true, stats, previousStats, trends, ...(filterOptions ? { filterOptions } : {}) };
});

export const aggregateAnalyticsRows = (rows, period) => {
  const aggregate = (key) => {
    const totals = rows.filter((row) => row.available).reduce((summary, row) => {
      const stats = row[key] || {};
      Object.keys(emptyAnalyticsStats()).forEach((field) => { summary[field] += Number(stats[field] || 0); });
      return summary;
    }, emptyAnalyticsStats());
    return finalizeAnalyticsStats(totals, period.days);
  };
  const mergeTrend = (trendKey) => {
    const map = new Map();
    rows.filter((row) => row.available).forEach((row) => {
      (row.trends?.[trendKey] || []).forEach((point) => {
        const current = map.get(point.date) || { date: point.date };
        Object.entries(point).forEach(([key, value]) => { if (key !== 'date') current[key] = Number(current[key] || 0) + Number(value || 0); });
        map.set(point.date, current);
      });
    });
    return [...map.values()].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  };
  return {
    totals: aggregate('stats'),
    previousTotals: period.previous ? aggregate('previousStats') : null,
    trends: { attendance: mergeTrend('attendance'), quran: mergeTrend('quran'), students: mergeTrend('students') },
  };
};

const emptyStats = () => ({
  studentsCount: 0,
  committeesCount: 0,
  supervisorsCount: 0,
  recitersCount: 0,
  activeStudentsCount: 0,
  attendanceRecords: 0,
  attendedCount: 0,
  attendanceRate: 0,
  tasksCount: 0,
  tasksDone: 0,
  executionRate: 0,
  recitationsCount: 0,
  pointsTotal: 0,
  storeOrdersCount: 0,
  recentActivityCount: 0,
  activityCount: 0,
});

const normalizeStats = (row = {}) => {
  const stats = Object.fromEntries(Object.entries(emptyStats()).map(([key]) => [key, Number(row[key] || 0)]));
  stats.attendanceRate = stats.attendanceRecords
    ? Math.round((stats.attendedCount / stats.attendanceRecords) * 100)
    : 0;
  stats.executionRate = stats.tasksCount
    ? Math.round((stats.tasksDone / stats.tasksCount) * 100)
    : 0;
  stats.activityCount = stats.attendedCount + stats.tasksDone + stats.recitationsCount + stats.recentActivityCount;
  return stats;
};

const readTenantStats = async (period) => {
  const [[row]] = await db().query(
    `
    SELECT
      (SELECT COUNT(*) FROM students) AS studentsCount,
      (SELECT COUNT(*) FROM committees) AS committeesCount,
      (SELECT COUNT(*) FROM supervisors WHERE role IN ('supervisor', 'admin')) AS supervisorsCount,
      (SELECT COUNT(*) FROM supervisors WHERE role = 'reciter') AS recitersCount,
      (SELECT COUNT(*) FROM students WHERE last_login_at >= CONCAT(?, ' 00:00:00') AND last_login_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)) AS activeStudentsCount,
      (SELECT COUNT(*) FROM attendance_records WHERE record_date BETWEEN ? AND ?) AS attendanceRecords,
      (SELECT COUNT(*) FROM attendance_records WHERE record_date BETWEEN ? AND ? AND status <> 'absent') AS attendedCount,
      (SELECT COUNT(*) FROM student_quran_tasks WHERE task_date BETWEEN ? AND ?) AS tasksCount,
      (SELECT COUNT(*) FROM student_quran_tasks t WHERE task_date BETWEEN ? AND ? AND ${accepted}) AS tasksDone,
      (SELECT COUNT(*) FROM student_quran_tasks WHERE task_date BETWEEN ? AND ? AND teacher_completed = 1) AS recitationsCount,
      (SELECT COALESCE(SUM(points), 0) FROM students) AS pointsTotal,
      (SELECT COUNT(*) FROM store_orders WHERE created_at >= CONCAT(?, ' 00:00:00') AND created_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)) AS storeOrdersCount,
      (SELECT COUNT(*) FROM activity_logs WHERE created_at >= CONCAT(?, ' 00:00:00') AND created_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)) AS recentActivityCount
    `,
    [
      period.from, period.to,
      period.from, period.to,
      period.from, period.to,
      period.from, period.to,
      period.from, period.to,
      period.from, period.to,
      period.from, period.to,
    ],
  );
  return normalizeStats(row);
};

const withTenant = async (complex, callback) => {
  if (!complex.databaseName) return { available: false, stats: emptyStats() };
  try {
    await initDatabase(complex.databaseName);
    return await runWithDatabase(
      complex.databaseName,
      { tenant: complex },
      callback,
    );
  } catch {
    return { available: false, stats: emptyStats(), errorCode: 'TENANT_STATS_UNAVAILABLE' };
  }
};

export const readComplexOverview = async (complex, period) => withTenant(complex, async () => ({
  available: true,
  stats: await readTenantStats(period),
}));

export const readComplexDetails = async (complex, period) => withTenant(complex, async () => {
  const [stats, [committeeRows], [attendanceRows], [taskRows], [activityRows]] = await Promise.all([
    readTenantStats(period),
    db().query(
      `
      SELECT c.id, c.name, c.points, COUNT(s.id) AS studentsCount
      FROM committees c
      LEFT JOIN students s ON s.committee_id = c.id
      GROUP BY c.id, c.name, c.points
      ORDER BY studentsCount DESC, c.name ASC
      `,
    ),
    db().query(
      `
      SELECT status, COUNT(*) AS count
      FROM attendance_records
      WHERE record_date BETWEEN ? AND ?
      GROUP BY status
      `,
      [period.from, period.to],
    ),
    db().query(
      `
      SELECT task_type AS taskType, COUNT(*) AS total, SUM(${accepted}) AS done
      FROM student_quran_tasks t
      WHERE task_date BETWEEN ? AND ?
      GROUP BY task_type
      `,
      [period.from, period.to],
    ),
    db().query(
      `
      SELECT action, actor_name AS actorName, created_at AS createdAt
      FROM activity_logs
      WHERE created_at >= CONCAT(?, ' 00:00:00')
        AND created_at < DATE_ADD(CONCAT(?, ' 00:00:00'), INTERVAL 1 DAY)
      ORDER BY created_at DESC, id DESC
      LIMIT 12
      `,
      [period.from, period.to],
    ),
  ]);

  return {
    available: true,
    stats,
    committees: committeeRows.map((row) => ({
      id: row.id,
      name: row.name,
      points: Number(row.points || 0),
      studentsCount: Number(row.studentsCount || 0),
    })),
    attendance: Object.fromEntries(attendanceRows.map((row) => [row.status, Number(row.count || 0)])),
    tasks: Object.fromEntries(taskRows.map((row) => [row.taskType, {
      total: Number(row.total || 0),
      done: Number(row.done || 0),
    }])),
    recentActivity: activityRows,
  };
});

export const mapComplexesWithLimit = async (complexes, mapper, limit = 4) => {
  const results = new Array(complexes.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, complexes.length) }, async () => {
    while (cursor < complexes.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(complexes[index]);
    }
  });
  await Promise.all(workers);
  return results;
};
