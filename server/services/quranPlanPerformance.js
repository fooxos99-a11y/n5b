import { remainingPlanFaces } from './quranPlanForecast.js';
import { planScheduleDates } from './planScheduleDates.js';
import { addDays } from './grading.js';
import { studyDateSql } from './seasonalHolidays.js';
import { loadIndividualStudentPlanPauses } from './studentPlanPause.js';
import { isStudentPlanPausedOn } from '../../shared/student-plan-pause.js';
import { acceptedQuranExecutionSql, quranRangeFacesSql } from './quranFaceMeasurement.js';

const number = value => Number(value || 0);
const covered = (plan, ranges) => Math.max(0, remainingPlanFaces(plan, []) - remainingPlanFaces(plan, ranges));
const percentage = (done, expected) => expected > 0 ? Math.round(done / expected * 1000) / 10 : null;

/** Revisions and queued successors apply from their effective date, never retroactively. */
export function selectPlanForDate(plans, date) {
  return plans.filter(plan => plan.startDate <= date && (plan.effectiveFrom || plan.startDate) <= date)
    .sort((a, b) => (b.effectiveFrom || b.startDate).localeCompare(a.effectiveFrom || a.startDate) || number(b.id) - number(a.id))[0];
}

/** Cumulative approved faces against the current plan schedule, retaining the latest rate-change anchor. */
export function planPerformanceSeries({ plan, dates, schedule, executions, prior = [], requirements = [] }) {
  const totalFaces = remainingPlanFaces(plan, []);
  const baseline = plan.track === 'mastery' ? [] : prior;
  const initialFaces = covered(plan, baseline);
  const anchorPlan = { ...plan, endSurah: plan.anchorSurah, endAyah: plan.anchorAyah };
  const anchorFaces = plan.anchorSurah && plan.anchorAyah
    ? Math.min(totalFaces, initialFaces + remainingPlanFaces(anchorPlan, []) - covered(anchorPlan, baseline)) : initialFaces;
  return dates.map(date => {
    if (date < plan.startDate || date < (plan.effectiveFrom || plan.startDate)) return { date, done: 0, expected: 0, percentage: null };
    let done = covered(plan, [...baseline, ...executions.filter(row => row.date <= date && (plan.track !== 'mastery' || number(row.planId) === number(plan.id)))]);
    let expected = Math.min(totalFaces, anchorFaces + schedule.filter(day => day <= date).length * number(plan.dailyPages));
    const components = { memorization: { done, expected } };
    for (const row of requirements) {
      if (row.date > date || row.date < (plan.effectiveFrom || plan.startDate) || (row.planId && number(row.planId) !== number(plan.id))) continue;
      const component = components[row.taskType] ||= { done: 0, expected: 0 };
      component.done += number(row.done); component.expected += number(row.expected);
      done += number(row.done); expected += number(row.expected);
    }
    return { date, done, expected, components, shortageFaces: Math.max(0, expected - done), aheadFaces: Math.max(0, done - expected), percentage: percentage(done, expected) };
  });
}

export function aggregatePlanPerformance(students, dates) {
  return dates.map((date, index) => {
    let done = 0, expected = 0;
    const components = {};
    for (const student of students) {
      const point = student.series[index];
      if (!point || !point.expected) continue;
      done += point.done; expected += point.expected;
      for (const [key, value] of Object.entries(point.components || {})) {
        const component = components[key] ||= { done: 0, expected: 0 };
        component.done += value.done; component.expected += value.expected;
      }
    }
    return { date, done, expected, components, shortageFaces: Math.max(0, expected - done), aheadFaces: Math.max(0, done - expected), percentage: percentage(done, expected) };
  });
}

/** Every data query uses the same server-owned report scope. No per-student database queries. */
export async function loadQuranPlanPerformance(scope, { from, to, workDays, readingDays = [], expand }) {
  if (from > to) return { students: [], series: [] };
  const [plans] = await scope.query(`SELECT p.id, p.student_id AS studentId, p.track,
    DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(p.effective_from, '%Y-%m-%d') AS effectiveFrom,
    p.start_surah AS startSurah, p.start_ayah AS startAyah, p.end_surah AS endSurah, p.end_ayah AS endAyah,
    p.daily_pages AS dailyPages, p.reading_faces AS readingFaces, p.schedule_days_json AS scheduleDays,
    p.schedule_anchor_surah AS anchorSurah, p.schedule_anchor_ayah AS anchorAyah
    FROM student_quran_plans p
    WHERE p.start_date <= ? AND (p.status IN ('active', 'completed')
      OR EXISTS (SELECT 1 FROM student_quran_plans successor WHERE successor.previous_plan_id = p.id))
      AND p.start_date IS NOT NULL AND ${scope.student('p.student_id')}
    ORDER BY p.student_id, COALESCE(p.effective_from, p.start_date), p.id`, [to]);
  if (!plans.length) return { students: [], series: [] };
  const [rows] = await scope.query(`SELECT t.student_id AS studentId, t.plan_id AS planId,
    DATE_FORMAT(t.task_date, '%Y-%m-%d') AS date, t.from_surah AS startSurah, t.from_ayah AS startAyah, t.from_page AS startPage,
    COALESCE(t.actual_to_surah, t.to_surah) AS endSurah, COALESCE(t.actual_to_ayah, t.to_ayah) AS endAyah,
    COALESCE(t.actual_to_page, t.to_page) AS endPage
    FROM student_quran_tasks t WHERE t.task_type = 'memorization' AND ${acceptedQuranExecutionSql('t')}
      AND ${studyDateSql('t.task_date', 't.student_id')} AND t.task_date <= ? AND ${scope.student('t.student_id')}`, [to]);
  const [credits] = await scope.query(`SELECT student_id AS studentId,
    DATE_FORMAT(compensated_date, '%Y-%m-%d') AS date, credited_ranges AS ranges FROM student_day_compensations
    WHERE scope = 'program' AND cancelled_at IS NULL AND ${studyDateSql('compensated_date', 'student_day_compensations.student_id')} AND compensated_date <= ? AND ${scope.student('student_id')}`, [to]);
  for (const credit of credits) {
    const ranges = typeof credit.ranges === 'string' ? JSON.parse(credit.ranges) : credit.ranges;
    rows.push(...(ranges || []).map(range => ({ ...range, studentId: credit.studentId, date: credit.date })));
  }
  const [prior] = await scope.query(`SELECT student_id AS studentId, start_surah AS startSurah, start_ayah AS startAyah, end_surah AS endSurah, end_ayah AS endAyah
    FROM student_quran_prior_memorization WHERE ${scope.student('student_id')}
    UNION ALL SELECT student_id AS studentId, start_surah AS startSurah, start_ayah AS startAyah, end_surah AS endSurah, end_ayah AS endAyah
    FROM student_quran_plan_prior_memorization WHERE ${scope.student('student_id')}`);
  const [requirements] = await scope.query(`SELECT t.student_id AS studentId, t.plan_id AS planId, t.task_type AS taskType,
    DATE_FORMAT(t.task_date, '%Y-%m-%d') AS date,
    CASE WHEN t.compensation_index = 0 THEN ${quranRangeFacesSql('t', 'expected')} ELSE 0 END AS expected,
    CASE WHEN ${acceptedQuranExecutionSql('t')} THEN ${quranRangeFacesSql('t', 'actual')} ELSE 0 END AS done
    FROM student_quran_tasks t WHERE t.task_type IN ('review', 'link', 'repeat')
      AND ${studyDateSql('t.task_date', 't.student_id')} AND t.task_date <= ? AND ${scope.student('t.student_id')}
    UNION ALL SELECT g.student_id AS studentId, NULL AS planId, 'reading' AS taskType,
      DATE_FORMAT(g.grade_date, '%Y-%m-%d') AS date,
      COALESCE(JSON_EXTRACT(g.detail_json, '$.expectedFaces'), JSON_EXTRACT(g.detail_json, '$.requiredFaces'), 0) AS expected,
      CASE WHEN g.passed = 1 THEN COALESCE(JSON_EXTRACT(g.detail_json, '$.requiredFaces'), 0) ELSE 0 END AS done
    FROM student_daily_grades g WHERE g.component = 'reading' AND ${studyDateSql('g.grade_date', 'g.student_id')}
      AND g.grade_date <= ? AND ${scope.student('g.student_id')}`, [to, to]);
  const earliest = plans.reduce((date, plan) => (plan.effectiveFrom || plan.startDate) < date ? plan.effectiveFrom || plan.startDate : date, to);
  const start = earliest > from ? earliest : from;
  const dates = [];
  for (let date = start; date <= to; date = addDays(date, 1)) dates.push(date);
  // At most 90 plotted dates; keep both boundaries and the final day.
  const plotted = dates.filter((_date, index) => index === dates.length - 1 || index % Math.max(1, Math.ceil(dates.length / 89)) === 0);
  const executionByStudent = new Map(), priorByStudent = new Map();
  for (const row of rows) {
    const expanded = (await expand(row)).map(range => ({ ...range, date: row.date, planId: row.planId }));
    const key = String(row.studentId);
    executionByStudent.set(key, [...(executionByStudent.get(key) || []), ...expanded]);
  }
  for (const row of prior) {
    const key = String(row.studentId);
    priorByStudent.set(key, [...(priorByStudent.get(key) || []), row]);
  }
  const calendars = new Map();
  const plansByStudent = new Map();
  for (const plan of plans) {
    const key = String(plan.studentId);
    plansByStudent.set(key, [...(plansByStudent.get(key) || []), plan]);
  }
  const individualPauses = await loadIndividualStudentPlanPauses(scope);
  const readingSchedule = readingDays.length ? await planScheduleDates(scope, earliest, to, readingDays, 'readingDays') : [];
  for (const plan of plans) {
    const stored = typeof plan.scheduleDays === 'string' ? JSON.parse(plan.scheduleDays) : plan.scheduleDays;
    const days = Array.isArray(stored) ? stored.map(Number) : workDays;
    plan.calendarKey = JSON.stringify(days);
    if (!calendars.has(plan.calendarKey)) calendars.set(plan.calendarKey, await planScheduleDates(scope, earliest, to, days));
  }
  for (const plan of plans) {
    for (const date of readingSchedule) {
      if (isStudentPlanPausedOn(date, individualPauses[plan.studentId])) continue;
      if (date < (plan.effectiveFrom || plan.startDate)) continue;
      if (selectPlanForDate(plansByStudent.get(String(plan.studentId)), date)?.id !== plan.id) continue;
      if (!requirements.some(row => String(row.studentId) === String(plan.studentId) && row.taskType === 'reading' && row.date === date)) {
        requirements.push({ studentId: plan.studentId, planId: plan.id, date, taskType: 'reading', expected: number(plan.readingFaces), done: 0 });
      }
    }
  }
  const versions = new Map(plans.map(plan => [String(plan.id), planPerformanceSeries({ plan, dates: plotted,
      schedule: calendars.get(plan.calendarKey).filter(date => date >= (plan.effectiveFrom || plan.startDate) && !isStudentPlanPausedOn(date, individualPauses[plan.studentId])),
      executions: executionByStudent.get(String(plan.studentId)) || [], prior: priorByStudent.get(String(plan.studentId)) || [],
      requirements: requirements.filter(row => String(row.studentId) === String(plan.studentId)) })]));
  const students = [...plansByStudent].map(([studentId, history]) => ({ studentId: number(studentId),
    series: plotted.map((date, index) => {
      const plan = selectPlanForDate(history, date);
      return plan ? { ...versions.get(String(plan.id))[index], planId: number(plan.id) }
        : { date, done: 0, expected: 0, percentage: null };
    }),
  }));
  return { students, series: aggregatePlanPerformance(students, plotted) };
}
