import { createOverviewReportScope } from './overviewReportScope.js';
import { loadGradingPolicy, weekStartOf } from './grading.js';
import { facesReadStatistics } from '../../shared/grading-engine.js';
import { loadExpectedGrades, includeUnrecordedGrades } from './expectedGrades.js';

const SESSION_COMPONENTS = new Set(['track', 'weekly']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const number = (value) => Number(value || 0);
const percentage = (grade, max) => (max > 0 ? Math.round((grade / max) * 1000) / 10 : 0);

function assertPeriod(from, to) {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    throw Object.assign(new Error('الفترة غير صحيحة.'), { status: 422 });
  }
}

/** «جلسة المسار» / «الجلسة الأسبوعية» report: one row per student for the weeks touching the period. */
export async function buildGradingSessionReport(connection, { component, from, to, committeeId = 'all', auth = null }) {
  if (!SESSION_COMPONENTS.has(component)) throw Object.assign(new Error('نوع الجلسة غير صحيح.'), { status: 422 });
  assertPeriod(from, to);
  const scope = createOverviewReportScope(connection, { auth, committeeId });
  const [rows] = await scope.query(
    `SELECT s.id, s.name, c.name AS committeeName,
       COUNT(w.id) AS recordedWeeks,
       COALESCE(SUM(w.attended = 1), 0) AS attended,
       COALESCE(SUM(w.attended = 0), 0) AS absent,
       COALESCE(SUM(w.grade), 0) AS grade,
       COALESCE(SUM(w.max_grade), 0) AS max
     FROM students s
     LEFT JOIN committees c ON c.id = s.committee_id
     LEFT JOIN student_weekly_components w
       ON w.student_id = s.id AND w.component = ? AND w.week_start BETWEEN ? AND ?
     WHERE ${scope.student('s.id')}
     GROUP BY s.id, s.name, c.name
     ORDER BY c.name, s.name`,
    [component, weekStartOf(from), to],
  );
  const policy = await loadGradingPolicy(scope);
  const expected = await loadExpectedGrades(scope, { from, to, policy });
  const completeRows = includeUnrecordedGrades(expected, rows, component);
  return {
    period: { from, to },
    rows: completeRows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      committeeName: row.committeeName || '',
      recordedWeeks: number(row.recordedWeeks),
      attended: number(row.attended),
      absent: number(row.absent),
      grade: number(row.grade),
      max: number(row.max),
      percentage: percentage(number(row.grade), number(row.max)),
    })),
  };
}

/** Students sorted by result and their circles aggregated, for one grade component. */
function gradeBreakdown(rows = []) {
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar');
  const students = rows.map((row) => {
    const grade = number(row.grade);
    const max = number(row.max);
    return {
      id: Number(row.id),
      name: row.name,
      committeeName: row.committeeName || '',
      ...(row.attendanceDays !== undefined ? { attendanceDays: number(row.attendanceDays) } : {}),
      ...(row.attended !== undefined ? { attended: number(row.attended), absent: number(row.absent) } : {}),
      grade,
      max,
      percentage: percentage(grade, max),
    };
  }).sort((a, b) => b.percentage - a.percentage || byName(a, b));
  const committees = new Map();
  for (const row of rows) {
    const key = String(row.committeeId ?? '');
    const entry = committees.get(key) || { id: row.committeeId == null ? null : Number(row.committeeId), name: row.committeeName || 'بدون حلقة', grade: 0, max: 0 };
    entry.grade += number(row.grade);
    entry.max += number(row.max);
    committees.set(key, entry);
  }
  return {
    committees: [...committees.values()]
      .map((entry) => ({ ...entry, percentage: percentage(entry.grade, entry.max) }))
      .sort((a, b) => b.percentage - a.percentage || byName(a, b)),
    studentsList: students,
  };
}

/**
 * Grade totals for the statistics page: weekly program, both weekly sessions and narration day,
 * plus the faces read (each recited memorization face counts once plus its configured repetitions).
 */
export async function buildGradingOverview(reportDb, { from, to, quranFaces = {} }) {
  const [[program]] = await reportDb.query(
    `SELECT COALESCE(SUM(grade), 0) AS grade, COALESCE(SUM(max_grade), 0) AS max, COUNT(DISTINCT student_id) AS students
     FROM student_daily_grades WHERE grade_date BETWEEN ? AND ? AND ${reportDb.student('student_id')}`,
    [from, to],
  );
  const [sessionRows] = await reportDb.query(
    `SELECT component, COUNT(*) AS recorded, COALESCE(SUM(attended = 1), 0) AS attended, COALESCE(SUM(attended = 0), 0) AS absent,
       COALESCE(SUM(grade), 0) AS grade, COALESCE(SUM(max_grade), 0) AS max
     FROM student_weekly_components
     WHERE week_start BETWEEN ? AND ? AND ${reportDb.student('student_id')}
     GROUP BY component`,
    [weekStartOf(from), to],
  );
  const [[narration]] = await reportDb.query(
    `SELECT COALESCE(SUM(points), 0) AS grade, COUNT(DISTINCT student_id) AS students
     FROM student_point_transactions
     WHERE dedupe_key LIKE 'grade:narration:%' AND transaction_date BETWEEN ? AND ? AND ${reportDb.student('student_id')}`,
    [from, to],
  );
  const [[reading]] = await reportDb.query(
    `SELECT COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(detail_json, '$.requiredFaces')) AS DECIMAL(10,2))), 0) AS faces
     FROM student_daily_grades
     WHERE component = 'reading' AND passed = 1 AND grade_date BETWEEN ? AND ? AND ${reportDb.student('student_id')}`,
    [from, to],
  );
  const policy = await loadGradingPolicy(reportDb);
  const facesRead = facesReadStatistics(policy, {
    memorizationFaces: number(quranFaces.memorization),
    linkFaces: number(quranFaces.link),
    reviewFaces: number(quranFaces.review),
    readingFaces: number(reading?.faces),
  });
  const session = (component, rows) => {
    const row = sessionRows.find((item) => item.component === component) || {};
    const grade = number(row.grade);
    const max = rows.reduce((sum, student) => sum + student.max, 0);
    return { recorded: number(row.recorded), attended: number(row.attended), absent: number(row.absent), grade, max, percentage: percentage(grade, max) };
  };
  const programGrade = number(program.grade);
  // Per-student rows let the reports page show the distribution by circle and each student's result.
  const [programStudentRows] = await reportDb.query(
    `SELECT s.id, s.name, c.id AS committeeId, c.name AS committeeName,
       COALESCE(SUM(g.grade), 0) AS grade, COALESCE(SUM(g.max_grade), 0) AS max
     FROM student_daily_grades g
     JOIN students s ON s.id = g.student_id
     LEFT JOIN committees c ON c.id = s.committee_id
     WHERE g.grade_date BETWEEN ? AND ? AND ${reportDb.student('g.student_id')}
     GROUP BY s.id, s.name, c.id, c.name`,
    [from, to],
  );
  const [sessionStudentRows] = await reportDb.query(
    `SELECT w.component, s.id, s.name, c.id AS committeeId, c.name AS committeeName,
       COALESCE(SUM(w.attended = 1), 0) AS attended, COALESCE(SUM(w.attended = 0), 0) AS absent,
       COALESCE(SUM(w.grade), 0) AS grade, COALESCE(SUM(w.max_grade), 0) AS max
     FROM student_weekly_components w
     JOIN students s ON s.id = w.student_id
     LEFT JOIN committees c ON c.id = s.committee_id
     WHERE w.week_start BETWEEN ? AND ? AND ${reportDb.student('w.student_id')}
     GROUP BY w.component, s.id, s.name, c.id, c.name`,
    [weekStartOf(from), to],
  );
  // Tested segments of each track session: how many were recited and their mistakes and warnings.
  const [trackDetailRows] = await reportDb.query(
    `SELECT student_id AS studentId, detail_json AS detail
     FROM student_weekly_components
     WHERE component = 'track' AND week_start BETWEEN ? AND ? AND ${reportDb.student('student_id')}`,
    [weekStartOf(from), to],
  );
  const [readingStudentRows] = await reportDb.query(
    `SELECT student_id AS studentId, COUNT(*) AS days,
       COALESCE(SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(detail_json, '$.requiredFaces')) AS DECIMAL(10,2))), 0) AS faces
     FROM student_daily_grades
     WHERE component = 'reading' AND passed = 1 AND grade_date BETWEEN ? AND ? AND ${reportDb.student('student_id')}
     GROUP BY student_id`,
    [from, to],
  );
  const [narrationStudentRows] = await reportDb.query(
    `SELECT s.id, s.name, c.name AS committeeName, COALESCE(SUM(t.points), 0) AS grade, COUNT(*) AS times
     FROM student_point_transactions t
     JOIN students s ON s.id = t.student_id
     LEFT JOIN committees c ON c.id = s.committee_id
     WHERE t.dedupe_key LIKE 'grade:narration:%' AND t.transaction_date BETWEEN ? AND ? AND ${reportDb.student('t.student_id')}
     GROUP BY s.id, s.name, c.name`,
    [from, to],
  );
  const expected = await loadExpectedGrades(reportDb, { from, to, policy });
  const programRows = includeUnrecordedGrades(expected, programStudentRows, 'program');
  const programMax = programRows.reduce((sum, row) => sum + row.max, 0);
  const programBreakdown = gradeBreakdown(programRows);
  const sessionRowsFor = component => includeUnrecordedGrades(expected, sessionStudentRows.filter(row => row.component === component), component);
  const sessionBreakdown = (component) => gradeBreakdown(sessionRowsFor(component));
  const track = trackSegments(trackDetailRows);
  const trackBreakdown = sessionBreakdown('track');
  return {
    weeklyProgram: { grade: programGrade, max: programMax, percentage: percentage(programGrade, programMax), students: number(program.students), ...programBreakdown },
    weeklySession: { ...session('weekly', sessionRowsFor('weekly')), ...sessionBreakdown('weekly') },
    trackSession: {
      ...session('track', sessionRowsFor('track')),
      ...trackBreakdown,
      segments: track.totals,
      studentsList: trackBreakdown.studentsList.map((student) => ({ ...student, segments: track.byStudent.get(String(student.id)) || emptySegments() })),
    },
    narration: {
      grade: number(narration.grade),
      students: number(narration.students),
      studentsList: narrationStudentRows
        .map((row) => ({ id: Number(row.id), name: row.name, committeeName: row.committeeName || '', grade: number(row.grade), times: number(row.times) }))
        .sort((a, b) => b.grade - a.grade || String(a.name || '').localeCompare(String(b.name || ''), 'ar')),
    },
    // Self reading is expected on the reading days (every day by default), attendance only on work days.
    reading: {
      expectedDays: countWeekDays(from, to, policy.weeklyProgram.readingDays),
      expectedByStudent: Object.fromEntries(expected.map(row => [String(row.id), row.readingDays])),
      days: readingStudentRows.reduce((total, row) => total + number(row.days), 0),
      byStudent: Object.fromEntries(readingStudentRows.map((row) => [String(row.studentId), { days: number(row.days), faces: number(row.faces) }])),
    },
    facesRead: {
      ...facesRead,
      repetitionsPerFace: policy.statistics.repetitionsPerFace,
      readingByStudent: Object.fromEntries(readingStudentRows.map((row) => [String(row.studentId), number(row.faces)])),
    },
  };
}

/** Number of dates from `from` to `to` (inclusive) falling on the given week days (0 = Sunday). */
function countWeekDays(from, to, weekDays = []) {
  const days = new Set((weekDays || []).map(Number));
  let count = 0;
  for (let date = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (days.has(date.getUTCDay())) count += 1;
  }
  return count;
}

const emptySegments = () => ({ tested: 0, total: 0, mistakes: 0, warnings: 0, grade: 0, max: 0 });

/** Sums the stored track-session segments per student and overall. */
function trackSegments(rows = []) {
  const totals = emptySegments();
  const byStudent = new Map();
  for (const row of rows) {
    let detail = row.detail;
    if (typeof detail === 'string') {
      try { detail = JSON.parse(detail); } catch { detail = null; }
    }
    const key = String(row.studentId);
    const entry = byStudent.get(key) || emptySegments();
    for (const segment of Array.isArray(detail?.segments) ? detail.segments : []) {
      for (const target of [entry, totals]) {
        target.total += 1;
        if (!segment.recorded) continue;
        target.tested += 1;
        target.mistakes += number(segment.mistakes);
        target.warnings += number(segment.warnings);
        target.grade += number(segment.grade);
        target.max += number(segment.max);
      }
    }
    byStudent.set(key, entry);
  }
  return { totals, byStudent };
}
