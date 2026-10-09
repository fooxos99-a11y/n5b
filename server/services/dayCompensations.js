import { assertGradeDate } from './gradeDateBoundary.js';
import { assertStudyDate } from './seasonalHolidays.js';
import { loadGradingPolicyForDate, upsertDailyGrade, recordWeeklyComponent, weekdayOf, weekStartOf } from './grading.js';
import { evaluateTrackSession } from '../../shared/grading-engine.js';
import { dailyGradeDedupeKey, syncGradePoints } from './gradePoints.js';
import { readQuranRange } from './quranReferenceCache.js';
import { findNextUnmemorizedPosition } from './quranMemorizationContinuity.js';
import { resolveMemorizedReading } from './selfReadingAmount.js';
import { loadCompensatedPlanRanges } from './compensationPlanCredit.js';
import { addDays } from './grading.js';
import { loadEligibleCompensationDays } from './compensationEligibility.js';
import { sessionAttendanceStatus } from '../../shared/session-attendance.js';

const invalid = message => Object.assign(new Error(message), { status: 422, statusCode: 422 });
const conflict = message => Object.assign(new Error(message), { status: 409, statusCode: 409 });
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const referenceOf = value => {
  const reference = String(value || '').trim();
  if (reference.length < 3 || reference.length > 500) throw invalid('اكتب مرجع الاستئذان المعتمد من 3 إلى 500 حرف.');
  return reference;
};

export async function approveCompensationExcuse(connection, { studentId, date, today, actor, excuseReference }) {
  const reference = referenceOf(excuseReference);
  await assertGradeDate(connection, studentId, date, { today });
  await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
  await connection.query(`INSERT INTO student_excuse_approvals
    (student_id, excuse_date, reference, approved_by_role, approved_by_id, approved_by_name)
    VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
  [studentId, date, reference, actor.role, actor.id, actor.name]);
}

/** Caller owns the transaction; the student lock serializes compensation and grade changes. */
export async function recordDayCompensation(connection, { studentId, date, today, actor, excuseReference, scope = 'program' }) {
  const reference = referenceOf(excuseReference);
  if (!['program', 'track'].includes(scope)) throw invalid('نوع التعويض غير صحيح.');
  await assertStudyDate(connection, today, studentId);
  await assertGradeDate(connection, studentId, date, { today });
  await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
  const period = scope === 'track' ? weekStartOf(date) : date;
  const [[existing]] = await connection.query(`SELECT id FROM student_day_compensations
    WHERE student_id = ? AND scope = ? AND period_date = ? AND cancelled_at IS NULL FOR UPDATE`, [studentId, scope, period]);
  if (existing) throw conflict('يوجد تعويض مسجل؛ يلزم إلغاؤه إداريًا قبل تسجيل بديل.');
  const eligible = await loadEligibleCompensationDays(connection, { studentIds: [studentId], scope, today });
  if (!eligible.get(studentId)?.some(day => day.date === date)) throw invalid('هذا اليوم غير مستحق للتعويض. تأكد من يوم الجلسة والاستئذان المعتمد وتاريخ أول خطة.');
  const [[attendance]] = await connection.query('SELECT status FROM attendance_records WHERE student_id = ? AND record_date = ?', [studentId, date]);
  const [[approval]] = await connection.query('SELECT id, reference FROM student_excuse_approvals WHERE student_id = ? AND excuse_date = ?', [studentId, date]);
  const [[weekly]] = await connection.query("SELECT * FROM student_weekly_components WHERE student_id = ? AND week_start = ? AND component = 'track' FOR UPDATE", [studentId, weekStartOf(date)]);
  const weeklyDetail = parse(weekly?.detail_json);
  const [[plan]] = await connection.query(`SELECT id, track, daily_pages AS dailyPages, start_page AS startPage, end_page AS endPage,
    start_surah AS startSurah, start_ayah AS startAyah, end_surah AS endSurah, end_ayah AS endAyah
    FROM student_quran_plans WHERE student_id = ?
    AND COALESCE(start_date, DATE(created_at)) <= ? ORDER BY COALESCE(start_date, DATE(created_at)) DESC, id DESC LIMIT 1`, [studentId, date]);
  if (!plan) throw invalid('لا توجد خطة للطالب في اليوم المحدد.');
  const policy = await loadGradingPolicyForDate(connection, date);
  const components = [];
  let before, ranges = [];
  if (scope === 'program') {
    const program = policy.weeklyProgram, day = weekdayOf(date);
    if (program.workDays.includes(day)) {
      for (const [component, key] of [['memorization', 'memorizationDaily'], ['link', 'linkDaily'], ['review', 'reviewDaily']]) {
        components.push({ component, max: program[key], grade: program[key] });
      }
    }
    if (program.readingDays.includes(day)) components.push({ component: 'reading', max: program.readingDaily, grade: program.readingDaily });
    if (!components.length) throw invalid('لا يوجد إنجاز مطلوب في اليوم المحدد.');
    const [previous] = await connection.query("SELECT * FROM student_daily_grades WHERE student_id = ? AND grade_date = ? AND component <> 'attendance' FOR UPDATE", [studentId, date]);
    before = { daily: previous };
    [ranges] = await connection.query(`SELECT plan_id AS planId, from_surah AS startSurah, from_ayah AS startAyah,
      from_page AS startPage, to_surah AS endSurah, to_ayah AS endAyah, to_page AS endPage
      FROM student_quran_tasks WHERE student_id = ? AND plan_id = ? AND task_date = ?
        AND task_type = 'memorization' AND compensation_index = 0`, [studentId, plan.id, date]);
    if (!ranges.length && program.workDays.includes(day)) ranges = await ungeneratedDayCredit(connection, { studentId, date, plan });
  } else {
    before = { weekly: weekly || null };
    const result = evaluateTrackSession(policy, { attendanceStatus: 'present' });
    components.push({ component: 'track', grade: result.segments.reduce((sum, row) => sum + row.max, 0) });
  }
  const [inserted] = await connection.query(`INSERT INTO student_day_compensations
    (student_id, compensated_date, period_date, scope, actor_role, actor_id, actor_name, excuse_reference,
     attendance_status, credited_components, before_json, credited_ranges)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [studentId, date, period, scope, actor.role, actor.id, actor.name, approval?.reference || reference, attendance?.status || null,
    JSON.stringify(components), JSON.stringify(before), JSON.stringify(ranges)]);
  const compensationId = Number(inserted.insertId);
  if (scope === 'track') {
    await recordWeeklyComponent(connection, { studentId, weekStart: period, component: 'track',
      attendanceStatus: sessionAttendanceStatus(weeklyDetail || (weekly ? { attended: Boolean(weekly.attended) } : null)), actor, compensationId,
      attendanceRecorded: Boolean(weekly) && weeklyDetail?.attendanceRecorded !== false });
  } else {
    for (const component of components) {
      await upsertDailyGrade(connection, { studentId, date, policy, actor, compensationId,
        result: { ...component, passed: true, failType: null, repeatRequired: false,
          operationType: 'compensation', compensatedDate: date, compensationId } });
    }
  }
  return { id: compensationId, studentId, date, scope, components };
}

/** Lazy plans may have no saved task for an excused day; derive its actual planned amount. */
async function ungeneratedDayCredit(connection, { studentId, date, plan }) {
  const [previous] = await connection.query(`SELECT from_surah AS startSurah, from_ayah AS startAyah,
    COALESCE(actual_to_surah, to_surah) AS endSurah, COALESCE(actual_to_ayah, to_ayah) AS endAyah
    FROM student_quran_tasks WHERE student_id = ? AND task_type = 'memorization' AND teacher_completed = 1
      AND task_date < ? AND (? <> 'mastery' OR plan_id = ?)
    UNION ALL SELECT start_surah, start_ayah, end_surah, end_ayah FROM student_quran_prior_memorization WHERE student_id = ? AND ? <> 'mastery'
    UNION ALL SELECT start_surah, start_ayah, end_surah, end_ayah FROM student_quran_plan_prior_memorization WHERE plan_id = ? AND ? <> 'mastery'`,
  [studentId, date, plan.track, plan.id, studentId, plan.track, plan.id, plan.track]);
  const credit = await loadCompensatedPlanRanges(connection, { studentId, planId: plan.id, throughDate: addDays(date, -1) });
  const ayahs = await readQuranRange(connection, 1, 604);
  const start = { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) };
  const end = { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) };
  const direction = start.surah > end.surah ? -1 : 1;
  const next = findNextUnmemorizedPosition({ ayahs, ranges: [...previous, ...credit], start, end, direction });
  if (!next) return [];
  const amount = resolveMemorizedReading({ ayahs, memorized: [{ startSurah: next.surah, startAyah: next.ayah,
    endSurah: end.surah, endAyah: end.ayah }], faces: Number(plan.dailyPages) || 1, direction });
  return amount.ranges.map(range => ({ ...range, planId: Number(plan.id) }));
}

/** Restore credited achievement only; retain current attendance and the immutable audit. */
export async function cancelDayCompensation(connection, { id, actor, reason }) {
  const cancellationReason = referenceOf(reason);
  const [[candidate]] = await connection.query('SELECT student_id AS studentId FROM student_day_compensations WHERE id = ?', [id]);
  if (!candidate) throw conflict('التعويض غير موجود.');
  await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [candidate.studentId]);
  const [[row]] = await connection.query(`SELECT *, DATE_FORMAT(compensated_date, '%Y-%m-%d') AS date,
    DATE_FORMAT(period_date, '%Y-%m-%d') AS period FROM student_day_compensations WHERE id = ? FOR UPDATE`, [id]);
  if (row.cancelled_at) throw conflict('أُلغي هذا التعويض مسبقًا.');
  const before = parse(row.before_json);
  if (!before) throw conflict('هذا سجل قديم دون نسخة للدرجات السابقة؛ لا يمكن إلغاؤه تلقائيًا.');
  await connection.query(`UPDATE student_day_compensations SET cancelled_at = CURRENT_TIMESTAMP(3),
    cancelled_by_role = ?, cancelled_by_id = ?, cancelled_by_name = ?, cancellation_reason = ? WHERE id = ?`,
  [actor.role, actor.id, actor.name, cancellationReason, id]);
  if (row.scope === 'track') {
    const [[current]] = await connection.query("SELECT detail_json AS detail FROM student_weekly_components WHERE student_id = ? AND week_start = ? AND component = 'track'", [row.student_id, row.period]);
    const currentDetail = parse(current?.detail);
    const attendanceStatus = sessionAttendanceStatus(currentDetail);
    const old = parse(before.weekly?.detail_json);
    if (!before.weekly && currentDetail?.attendanceRecorded === false) {
      await connection.query("DELETE FROM student_weekly_components WHERE student_id = ? AND week_start = ? AND component = 'track'", [row.student_id, row.period]);
      await syncGradePoints(connection, { studentId: row.student_id, date: row.period, dedupeKey: `grade:weekly:${row.student_id}:${row.period}:track`, points: 0, reason: 'إلغاء التعويض', actor });
    } else {
      await recordWeeklyComponent(connection, { studentId: row.student_id, weekStart: row.period, component: 'track',
        attendanceStatus, segments: old?.segments || [], attendanceRecorded: attendanceStatus !== null, actor });
    }
  } else {
    const policy = await loadGradingPolicyForDate(connection, row.date);
    for (const credited of parse(row.credited_components)) {
      const old = before.daily.find(grade => grade.component === credited.component);
      if (old) {
        await upsertDailyGrade(connection, { studentId: row.student_id, date: row.date,
          result: parse(old.detail_json) || { component: old.component, grade: Number(old.grade), max: Number(old.max_grade), passed: Number(old.passed) === 1, failType: old.fail_type, failReason: old.fail_reason, repeatRequired: Number(old.repeat_required) === 1 }, policy: parse(old.policy_json) || policy,
          actor: { role: old.recorded_by_role, id: old.recorded_by_id } });
      } else {
        await connection.query('DELETE FROM student_daily_grades WHERE student_id = ? AND grade_date = ? AND component = ?', [row.student_id, row.date, credited.component]);
        await syncGradePoints(connection, { studentId: row.student_id, date: row.date,
          dedupeKey: dailyGradeDedupeKey(row.student_id, row.date, credited.component), points: 0, reason: 'إلغاء التعويض', actor });
      }
    }
  }
  return { studentId: Number(row.student_id), date: row.date, scope: row.scope };
}
