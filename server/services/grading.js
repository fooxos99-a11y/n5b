import { recordedSessionDay } from '../../shared/session-period.js';
import { assertDailyGradeNotCompensated, activeTrackCompensation } from './compensatedGradeGuard.js';
import {
  GRADING_POLICY_SETTING_KEY,
  normalizeGradingPolicy,
  gradingPolicyErrors,
  parseGradingPolicy,
} from '../../shared/grading-policy.js';
import { loadSeasonalHolidays } from './seasonalHolidays.js';
import { loadIndividualStudentPlanPauses } from './studentPlanPause.js';
import { isStudentPlanPausedOn } from '../../shared/student-plan-pause.js';
import { isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { getBusinessDate } from '../../shared/business-date.js';
import {
  averageWeeklyTotals,
  computeWeeklyGrade,
  evaluateAttendance,
  evaluateLink,
  evaluateMemorization,
  evaluateReading,
  evaluateReview,
  evaluateTrackSession,
  evaluateWeeklySession,
  facesReadStatistics,
} from '../../shared/grading-engine.js';
import {
  dailyGradeDedupeKey,
  GRADE_POINT_REASONS,
  syncGradePoints,
  weeklyGradeDedupeKey,
} from './gradePoints.js';

export const MANUAL_FAIL_RATING_KEY = 'manual_fail';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toDate = value => new Date(`${value}T00:00:00Z`);
const formatDate = date => date.toISOString().slice(0, 10);

export function isGradingDate(value) {
  return DATE_PATTERN.test(String(value || '')) && !Number.isNaN(toDate(value).getTime()) && formatDate(toDate(value)) === value;
}

export function addDays(date, days) {
  const value = toDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return formatDate(value);
}

export function weekdayOf(date) {
  return toDate(date).getUTCDay();
}

/** Weeks run from Sunday to Saturday. */
export function weekStartOf(date) {
  return addDays(date, -weekdayOf(date));
}

export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export async function loadGradingPolicy(queryExecutor) {
  const [[row]] = await queryExecutor.query('SELECT setting_value AS value FROM app_settings WHERE setting_key = ? LIMIT 1', [GRADING_POLICY_SETTING_KEY]);
  return parseGradingPolicy(row?.value);
}

/** Read only session records, rather than the week policy frozen by unrelated daily grades. */
export async function loadRecordedSessionDays(queryExecutor, { studentIds, component }) {
  if (!studentIds.length) return {};
  const section = component === 'track' ? 'trackSession' : 'weeklySession';
  const [rows] = await queryExecutor.query(
    `SELECT DATE_FORMAT(week_start, '%Y-%m-%d') AS weekStart, policy_json AS policy
     FROM student_weekly_components WHERE student_id IN (?) AND component = ? ORDER BY week_start, id`,
    [studentIds, component],
  );
  return Object.fromEntries(rows.map(row => [row.weekStart, recordedSessionDay(null, parseGradingPolicy(row.policy), section)]));
}

export async function loadSessionDay(queryExecutor, { studentId, weekStart, component, currentPolicy }) {
  const section = component === 'track' ? 'trackSession' : 'weeklySession';
  const [[row]] = await queryExecutor.query(
    'SELECT policy_json AS policy FROM student_weekly_components WHERE student_id = ? AND week_start = ? AND component = ? LIMIT 1',
    [studentId, weekStart, component],
  );
  return recordedSessionDay(currentPolicy[section].sessionDay, row ? parseGradingPolicy(row.policy) : null, section);
}

export async function saveGradingPolicy(queryExecutor, rawPolicy) {
  const errors = gradingPolicyErrors(rawPolicy);
  if (Object.keys(errors).length) throw Object.assign(new Error(Object.values(errors)[0]), { status: 422, statusCode: 422 });
  const policy = normalizeGradingPolicy(rawPolicy);
  await queryExecutor.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [GRADING_POLICY_SETTING_KEY, JSON.stringify(policy)],
  );
  return policy;
}

/** The rules of a week are frozen by the first grade recorded in it. */
export async function freezeWeekPolicy(queryExecutor, weekStart, policy) {
  await queryExecutor.query(
    'INSERT IGNORE INTO grading_week_policies (week_start, policy_json) VALUES (?, ?)',
    [weekStart, JSON.stringify(normalizeGradingPolicy(policy))],
  );
}

async function readWeekPolicies(queryExecutor, weekStarts, currentPolicy) {
  const unique = [...new Set(weekStarts)];
  const policies = new Map(unique.map(week => [week, currentPolicy]));
  if (!unique.length) return policies;
  const [rows] = await queryExecutor.query(
    `SELECT DATE_FORMAT(week_start, '%Y-%m-%d') AS weekStart, policy_json AS policy
     FROM grading_week_policies WHERE week_start IN (${unique.map(() => '?').join(', ')})`,
    unique,
  );
  for (const row of rows) policies.set(row.weekStart, parseGradingPolicy(row.policy));
  return policies;
}

export async function loadGradingPolicyForDate(queryExecutor, date, { freeze = true } = {}) {
  const current = await loadGradingPolicy(queryExecutor);
  const weekStart = weekStartOf(date);
  if (freeze) await freezeWeekPolicy(queryExecutor, weekStart, current);
  return (await readWeekPolicies(queryExecutor, [weekStart], current)).get(weekStart);
}

const actorOf = (actor = {}) => [actor.role || null, Number(actor.id) || null];

/**
 * A grade and its points change together. A pool gets its own transaction;
 * a connection passed by the caller is already inside the caller's transaction.
 */
async function withGradeTransaction(queryExecutor, work) {
  if (typeof queryExecutor.getConnection !== 'function') return work(queryExecutor);
  const connection = await queryExecutor.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const syncDailyGradePoints = (connection, { studentId, date, component, grade, actor }) => syncGradePoints(connection, {
  studentId,
  dedupeKey: dailyGradeDedupeKey(studentId, date, component),
  points: grade,
  date,
  reason: GRADE_POINT_REASONS[component],
  actor,
});

export async function upsertDailyGrade(queryExecutor, { studentId, date, result, policy, actor, compensationId = null }) {
  await withGradeTransaction(queryExecutor, async (connection) => {
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    await assertDailyGradeNotCompensated(connection, { studentId, date, component: result.component, compensationId });
    await writeDailyGrade(connection, { studentId, date, result, policy, actor });
    await syncDailyGradePoints(connection, { studentId, date, component: result.component, grade: result.grade, actor });
  });
}

async function writeDailyGrade(queryExecutor, { studentId, date, result, policy, actor }) {
  await freezeWeekPolicy(queryExecutor, weekStartOf(date), policy);
  const [role, id] = actorOf(actor);
  await queryExecutor.query(
    `INSERT INTO student_daily_grades
      (student_id, grade_date, component, grade, max_grade, passed, manual_fail, fail_type, fail_reason,
       repeat_required, detail_json, policy_json, recorded_by_role, recorded_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE grade = VALUES(grade), max_grade = VALUES(max_grade), passed = VALUES(passed),
       manual_fail = VALUES(manual_fail), fail_type = VALUES(fail_type), fail_reason = VALUES(fail_reason),
       repeat_required = VALUES(repeat_required), detail_json = VALUES(detail_json), policy_json = VALUES(policy_json),
       recorded_by_role = VALUES(recorded_by_role), recorded_by_id = VALUES(recorded_by_id)`,
    [
      studentId, date, result.component, result.grade, result.max, result.passed ? 1 : 0,
      result.failType === 'manual' ? 1 : 0, result.failType || null, result.failReason || null,
      result.repeatRequired ? 1 : 0, JSON.stringify(result), JSON.stringify(normalizeGradingPolicy(policy)), role, id,
    ],
  );
}

export async function deleteDailyGrade(queryExecutor, { studentId, date, component, actor }) {
  await withGradeTransaction(queryExecutor, async (connection) => {
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    await assertDailyGradeNotCompensated(connection, { studentId, date, component });
    await connection.query(
      'DELETE FROM student_daily_grades WHERE student_id = ? AND grade_date = ? AND component = ?',
      [studentId, date, component],
    );
    await syncDailyGradePoints(connection, { studentId, date, component, grade: 0, actor });
  });
}

export async function recordAttendanceGrade(queryExecutor, { studentId, date, status, actor }) {
  const policy = await loadGradingPolicyForDate(queryExecutor, date);
  if (!status) {
    await deleteDailyGrade(queryExecutor, { studentId, date, component: 'attendance', actor });
    return null;
  }
  const result = evaluateAttendance(policy, status);
  await upsertDailyGrade(queryExecutor, { studentId, date, result, policy, actor });
  return result;
}

export async function recordReadingGrade(queryExecutor, { studentId, date, completed, requiredFaces, expectedFaces, expectedHizbs, readingRange, actor }) {
  const policy = await loadGradingPolicyForDate(queryExecutor, date);
  const result = evaluateReading(policy, { completed, requiredFaces, expectedFaces, requiredHizbs: readingRange?.hizbCount, expectedHizbs });
  if (readingRange) {
    const { fromHizb, toHizb, hizbCount, range } = readingRange;
    Object.assign(result, { fromHizb, toHizb, hizbCount, range,
      ...(readingRange.ranges ? { ranges: readingRange.ranges, readingCursor: readingRange.cursor } : {}) });
  }
  await upsertDailyGrade(queryExecutor, { studentId, date, result, policy, actor });
  return result;
}

const syncWeeklyGradePoints = (connection, { studentId, weekStart, component, grade, actor }) => syncGradePoints(connection, {
  studentId,
  dedupeKey: weeklyGradeDedupeKey(studentId, weekStart, component),
  points: grade,
  date: weekStart,
  reason: GRADE_POINT_REASONS[component],
  actor,
});

export async function recordWeeklyComponent(queryExecutor, { studentId, weekStart, component, attended, attendanceStatus, segments = [], actor, compensationId = null, attendanceRecorded = true }) {
  const frozenPolicy = await loadGradingPolicyForDate(queryExecutor, weekStart);
  const currentPolicy = await loadGradingPolicy(queryExecutor);
  const section = component === 'track' ? 'trackSession' : 'weeklySession';
  const sessionDay = await loadSessionDay(queryExecutor, { studentId, weekStart, component, currentPolicy });
  const policy = { ...frozenPolicy, [section]: { ...frozenPolicy[section], sessionDay } };
  const result = component === 'track'
    ? evaluateTrackSession(policy, { attended, attendanceStatus, segments })
    : evaluateWeeklySession(policy, { attended, attendanceStatus });
  result.attendanceRecorded = attendanceRecorded && result.attendanceStatus !== null;
  const [role, id] = actorOf(actor);
  await withGradeTransaction(queryExecutor, async (connection) => {
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    const compensation = component === 'track' ? await activeTrackCompensation(connection, studentId, weekStart) : null;
    if (compensation) {
      if (compensationId && Number(compensation.id) !== compensationId) throw Object.assign(new Error('تعذر مطابقة التعويض.'), { status: 409 });
      const full = evaluateTrackSession(policy, { attendanceStatus: 'present', segments: [] });
      if (!result.attendanceRecorded) result.attendanceGrade = 0;
      Object.assign(result, { operationType: 'compensation', compensationId: Number(compensation.id),
        segments: full.segments.map(row => ({ ...row, recorded: false, compensated: true, grade: row.max })),
        grade: Math.round((result.attendanceGrade + full.segments.reduce((sum, row) => sum + row.max, 0)) * 100) / 100 });
    }
    await freezeWeekPolicy(connection, weekStart, policy);
    await connection.query(
      `INSERT INTO student_weekly_components
        (student_id, week_start, component, attended, grade, max_grade, detail_json, policy_json, recorded_by_role, recorded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE attended = VALUES(attended), grade = VALUES(grade), max_grade = VALUES(max_grade),
         detail_json = VALUES(detail_json), policy_json = VALUES(policy_json),
         recorded_by_role = VALUES(recorded_by_role), recorded_by_id = VALUES(recorded_by_id)`,
      [studentId, weekStart, component, result.attended ? 1 : 0, result.grade, result.max, JSON.stringify(result), JSON.stringify(policy), role, id],
    );
    await syncWeeklyGradePoints(connection, { studentId, weekStart, component, grade: result.grade, actor });
  });
  return result;
}

export async function deleteWeeklyComponent(queryExecutor, { studentId, weekStart, component, actor }) {
  await withGradeTransaction(queryExecutor, async (connection) => {
    await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    if (component === 'track' && await activeTrackCompensation(connection, studentId, weekStart)) {
      throw Object.assign(new Error('ألغِ التعويض إداريًا قبل حذف الجلسة.'), { status: 409 });
    }
    await connection.query(
      'DELETE FROM student_weekly_components WHERE student_id = ? AND week_start = ? AND component = ?',
      [studentId, weekStart, component],
    );
    await syncWeeklyGradePoints(connection, { studentId, weekStart, component, grade: 0, actor });
  });
}

const recitationComponent = taskType => ({ memorization: 'memorization', review: 'review', link: 'link' })[taskType] || null;

/**
 * Recomputes the day grade of one recitation group (all rows of one type on one date).
 * A failure is recorded as soon as it is known; a pass only when every row was evaluated.
 */
export async function recomputeRecitationGroupGrade(queryExecutor, { planId, studentId, date, taskType, actor }) {
  const component = recitationComponent(taskType);
  if (!component) return null;
  const [rows] = await queryExecutor.query(
    `SELECT id, from_page AS fromPage, hizb_number AS hizbNumber, warning_count AS warnings, hesitation_count AS hesitations,
       mistake_count AS mistakes, teacher_rating_key AS ratingKey, evaluated_at AS evaluatedAt,
       teacher_completed AS teacherCompleted
     FROM student_quran_tasks
     WHERE plan_id = ? AND task_date = ? AND task_type = ? AND compensation_index = 0
     ORDER BY from_page ASC, id ASC`,
    [planId, date, taskType],
  );
  if (!rows.length) return null;
  const evaluated = rows.filter(row => row.evaluatedAt);
  if (!evaluated.length) {
    await deleteDailyGrade(queryExecutor, { studentId, date, component, actor });
    return null;
  }
  const policy = await loadGradingPolicyForDate(queryExecutor, date);
  const manualFail = evaluated.some(row => row.ratingKey === MANUAL_FAIL_RATING_KEY);
  const counts = row => ({ mistakes: Number(row.mistakes) || 0, warnings: Number(row.warnings) || 0, hesitations: Number(row.hesitations) || 0 });
  let result;
  if (component === 'memorization') {
    result = evaluateMemorization(policy, { manualFail, faces: evaluated.map(row => ({ ...counts(row), page: Number(row.fromPage) || null })) });
  } else if (component === 'review') {
    const byHizb = new Map();
    for (const row of evaluated) {
      const key = row.hizbNumber ? `hizb:${row.hizbNumber}` : `row:${row.id}`;
      const current = byHizb.get(key) || { hizb: Number(row.hizbNumber) || null, mistakes: 0, warnings: 0, hesitations: 0 };
      current.mistakes += counts(row).mistakes;
      current.warnings += counts(row).warnings;
      current.hesitations += counts(row).hesitations;
      byHizb.set(key, current);
    }
    result = evaluateReview(policy, { manualFail, hizbs: [...byHizb.values()] });
  } else {
    const total = evaluated.reduce((sum, row) => ({ mistakes: sum.mistakes + counts(row).mistakes, warnings: sum.warnings + counts(row).warnings, hesitations: sum.hesitations + counts(row).hesitations }), { mistakes: 0, warnings: 0, hesitations: 0 });
    result = evaluateLink(policy, { ...total, manualFail });
  }
  const complete = evaluated.length === rows.length;
  if (!result.passed || complete) {
    await upsertDailyGrade(queryExecutor, { studentId, date, result, policy, actor });
  } else {
    await deleteDailyGrade(queryExecutor, { studentId, date, component, actor });
  }
  return { result, complete, failed: !result.passed, taskIds: rows.map(row => Number(row.id)) };
}

/** Per-row outcome used while the rest of the group is still being evaluated. */
export function evaluateRecitationRow(policy, { taskType, mistakes = 0, warnings = 0, hesitations = 0, manualFail = false }) {
  if (taskType === 'memorization') {
    const result = evaluateMemorization(policy, { faces: [{ mistakes, warnings, hesitations }], manualFail });
    const face = result.faces[0];
    return { passed: !manualFail && !face.failed, score: face.score, threshold: result.singleFaceThreshold };
  }
  if (taskType === 'review') {
    const result = evaluateReview(policy, { hizbs: [{ mistakes, warnings, hesitations }], manualFail });
    return { passed: !manualFail && !result.hizbs[0].failed, score: result.rawScore, threshold: result.amountThreshold };
  }
  const result = evaluateLink(policy, { mistakes, warnings, hesitations, manualFail });
  return { passed: result.passed, score: result.rawScore, threshold: result.threshold };
}

const parseJson = value => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

/**
 * Weekly grades for many students. Each day component comes from its stored record;
 * the frozen week policy decides the structure and maxima.
 */
async function loadWeeklyGradeRows(queryExecutor, ids, weekStarts) {
  const weekStart = weekStarts[0];
  const holidays = await loadSeasonalHolidays(queryExecutor);
  const individualPauses = await loadIndividualStudentPlanPauses(queryExecutor);
  const weekEnd = addDays(weekStarts.at(-1), 6);
  const placeholders = ids.map(() => '?').join(', ');
  const currentPolicy = await loadGradingPolicy(queryExecutor);
  const policies = await readWeekPolicies(queryExecutor, weekStarts, currentPolicy);
  const [dailyRows] = await queryExecutor.query(
    `SELECT student_id AS studentId, DATE_FORMAT(grade_date, '%Y-%m-%d') AS date, component, grade,
       max_grade AS maxGrade, passed, fail_reason AS failReason, detail_json AS detail
     FROM student_daily_grades
     WHERE student_id IN (${placeholders}) AND grade_date BETWEEN ? AND ?`,
    [...ids, weekStart, weekEnd],
  );
  const [taskRows] = await queryExecutor.query(
    `SELECT student_id AS studentId, DATE_FORMAT(task_date, '%Y-%m-%d') AS date, task_type AS taskType
     FROM student_quran_tasks
     WHERE student_id IN (${placeholders}) AND task_date BETWEEN ? AND ? AND task_type IN ('memorization', 'review', 'link')
     GROUP BY student_id, task_date, task_type`,
    [...ids, weekStart, weekEnd],
  );
  const [planRows] = await queryExecutor.query(
    `SELECT student_id AS studentId, DATE_FORMAT(COALESCE(effective_from, start_date, created_at), '%Y-%m-%d') AS startDate,
       status
     FROM student_quran_plans WHERE student_id IN (${placeholders})`,
    ids,
  );
  const [weeklyRows] = await queryExecutor.query(
    `SELECT student_id AS studentId, DATE_FORMAT(week_start, '%Y-%m-%d') AS weekStart, component, attended, grade, detail_json AS detail, policy_json AS policy
     FROM student_weekly_components WHERE student_id IN (${placeholders}) AND ${weekStarts.length === 1 ? 'week_start = ?' : 'week_start BETWEEN ? AND ?'}`,
    [...ids, weekStart, ...(weekStarts.length === 1 ? [] : [weekStarts.at(-1)])],
  );
  return { holidays, individualPauses, policies, currentPolicy, dailyRows, taskRows, planRows, weeklyRows };
}

export async function computeStudentsWeeklyGrades(queryExecutor, { studentIds, weekStart, today = getBusinessDate() }) {
  const ids = [...new Set(studentIds.map(Number).filter(Boolean))];
  if (!ids.length) return new Map();
  const data = await loadWeeklyGradeRows(queryExecutor, ids, [weekStart]);
  return weeklyGradesFromRows(ids, weekStart, today, data);
}

/** Read all actual session weeks in one batch, including weeks without Quran tasks. */
export async function computeStudentSessionGrades(queryExecutor, { studentId, dates = [], today = getBusinessDate() }) {
  const [recordDates] = await queryExecutor.query(`
    SELECT DATE_FORMAT(grade_date, '%Y-%m-%d') AS date FROM student_daily_grades WHERE student_id = ? AND grade_date <= ?
    UNION SELECT DATE_FORMAT(week_start, '%Y-%m-%d') AS date FROM student_weekly_components WHERE student_id = ? AND week_start <= ?`,
  [studentId, today, studentId, today]);
  const weekStarts = [...new Set([today, ...dates, ...recordDates.map(row => row.date)]
    .filter(date => isGradingDate(date) && date <= today).map(weekStartOf))].sort((a, b) => a.localeCompare(b));
  const data = await loadWeeklyGradeRows(queryExecutor, [studentId], weekStarts);
  return weekStarts.map(weekStart => weeklyGradesFromRows([studentId], weekStart, today, data).get(studentId)).reverse();
}

function weeklyGradesFromRows(ids, weekStart, today, { holidays, individualPauses, policies, currentPolicy, dailyRows, taskRows, planRows, weeklyRows }) {
  const dates = weekDates(weekStart);
  const weekEnd = dates.at(-1);
  const policy = policies.get(weekStart);
  const excluded = (date, studentId) => isSeasonalHoliday(date, holidays) || isStudentPlanPausedOn(date, individualPauses[studentId]);
  const daily = new Map();
  for (const row of dailyRows) if (!excluded(row.date, row.studentId)) daily.set(`${row.studentId}:${row.date}:${row.component}`, row);
  const scheduled = new Set(taskRows.filter(row => !excluded(row.date, row.studentId)).map(row => `${row.studentId}:${row.date}:${row.taskType}`));
  const weekly = new Map(weeklyRows.filter(row => (!row.weekStart || row.weekStart === weekStart) && !dates.every(date => excluded(date, row.studentId))).map(row => [`${row.studentId}:${row.component}`, row]));
  const planStart = new Map();
  for (const row of planRows) {
    if (!['active', 'completed'].includes(row.status)) continue;
    const previous = planStart.get(Number(row.studentId));
    if (!previous || row.startDate < previous) planStart.set(Number(row.studentId), row.startDate);
  }
  const results = new Map();
  for (const studentId of ids) {
    const days = dates.map(date => {
      const entry = component => daily.get(`${studentId}:${date}:${component}`);
      const recitation = component => {
        const record = entry(component);
        return {
          scheduled: scheduled.has(`${studentId}:${date}:${component}`),
          ...(record ? { grade: Number(record.grade) } : {}),
        };
      };
      const start = planStart.get(studentId);
      return {
        date,
        weekday: weekdayOf(date),
        seasonalHoliday: excluded(date, studentId),
        planActive: Boolean(start && start <= date),
        attendance: entry('attendance') ? { grade: Number(entry('attendance').grade) } : null,
        memorization: recitation('memorization'),
        link: recitation('link'),
        review: recitation('review'),
        reading: entry('reading') ? { grade: Number(entry('reading').grade) } : null,
      };
    });
    const track = weekly.get(`${studentId}:track`);
    const weeklySession = weekly.get(`${studentId}:weekly`);
    const grade = computeWeeklyGrade(policy, {
      days,
      today,
      track: track ? { grade: Number(track.grade) } : null,
      weekly: weeklySession ? { grade: Number(weeklySession.grade) } : null,
    });
    results.set(studentId, {
      studentId,
      weekStart,
      weekEnd,
      policy: { ...policy, ...Object.fromEntries([['trackSession', track], ['weeklySession', weeklySession]].map(([section, row]) => [section, {
        ...policy[section], sessionDay: recordedSessionDay(currentPolicy[section].sessionDay, row ? parseGradingPolicy(row.policy) : null, section),
      }])) },
      ...grade,
      records: Object.fromEntries(dates.map(date => [date, Object.fromEntries(
        ['attendance', 'memorization', 'link', 'review', 'reading'].flatMap(component => {
          const record = daily.get(`${studentId}:${date}:${component}`);
          return record ? [[component, {
            grade: Number(record.grade),
            max: Number(record.maxGrade),
            passed: Boolean(Number(record.passed)),
            failReason: record.failReason,
            detail: parseJson(record.detail),
          }]] : [];
        }),
      )])),
      trackDetail: parseJson(track?.detail),
      weeklyDetail: parseJson(weeklySession?.detail),
    });
  }
  return results;
}

/** Every week from the term start to today; the average uses finished weeks, or the current one if none finished. */
export async function computeTermGrades(queryExecutor, { studentIds, from, today }) {
  const weekStarts = [];
  for (let week = weekStartOf(from); week <= today; week = addDays(week, 7)) weekStarts.push(week);
  const byStudent = new Map(studentIds.map(id => [Number(id), []]));
  for (const weekStart of weekStarts) {
    const results = await computeStudentsWeeklyGrades(queryExecutor, { studentIds, weekStart, today });
    for (const [studentId, result] of results) {
      byStudent.get(studentId).push({ weekStart, weekEnd: result.weekEnd, total: result.total, max: result.max, finished: result.weekEnd < today });
    }
  }
  return new Map([...byStudent].map(([studentId, weeks]) => {
    const finished = weeks.filter(week => week.finished);
    return [studentId, { weeks, average: averageWeeklyTotals(finished.length ? finished : weeks) }];
  }));
}

/** Faces read in a period: memorization passes count with their repetitions. */
export async function computeFacesRead(queryExecutor, { studentIds, from, to }) {
  const ids = [...new Set(studentIds.map(Number).filter(Boolean))];
  if (!ids.length) return new Map();
  const policy = await loadGradingPolicy(queryExecutor);
  const placeholders = ids.map(() => '?').join(', ');
  const [taskRows] = await queryExecutor.query(
    `SELECT student_id AS studentId, task_type AS taskType,
       SUM(COALESCE(NULLIF(target_pages, 0), ABS(COALESCE(actual_to_page, to_page) - from_page) + 1)) AS faces
     FROM student_quran_tasks
     WHERE student_id IN (${placeholders}) AND task_date BETWEEN ? AND ?
       AND task_type IN ('memorization', 'review', 'link') AND teacher_completed = 1
     GROUP BY student_id, task_type`,
    [...ids, from, to],
  );
  const [readingRows] = await queryExecutor.query(
    `SELECT student_id AS studentId, detail_json AS detail FROM student_daily_grades
     WHERE student_id IN (${placeholders}) AND component = 'reading' AND passed = 1 AND grade_date BETWEEN ? AND ?`,
    [...ids, from, to],
  );
  const totals = new Map(ids.map(id => [id, { memorizationFaces: 0, linkFaces: 0, reviewFaces: 0, readingFaces: 0 }]));
  for (const row of taskRows) {
    const current = totals.get(Number(row.studentId));
    current[`${row.taskType}Faces`] += Number(row.faces) || 0;
  }
  for (const row of readingRows) {
    totals.get(Number(row.studentId)).readingFaces += Number(parseJson(row.detail)?.requiredFaces) || 0;
  }
  return new Map([...totals].map(([id, value]) => [id, facesReadStatistics(policy, value)]));
}
