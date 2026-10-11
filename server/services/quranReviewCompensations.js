import { studyDateSql } from './seasonalHolidays.js';
import { getBusinessDate } from '../../shared/business-date.js';

/** A failed compensation can be recited again atomically by its original teacher. */
export async function canRetryReviewCompensation(connection, { req, slot, task, sessionDate, currentPlanVersion }) {
  if (task.taskType !== 'review' || Number(task.compensationIndex) <= 0 || !req.recitationTransaction
    || sessionDate !== getBusinessDate() || slot.evaluatorRole !== req.auth.role
    || Number(slot.evaluatorId) !== Number(req.auth.id) || Number(slot.planId) !== Number(task.planId)
    || Number(slot.planVersion) !== Number(currentPlanVersion)) return false;
  const [rows] = await connection.query(`SELECT id, teacher_completed AS teacherCompleted,
    student_status AS studentStatus, execution_state AS executionState, review_execution_json AS reviewExecution,
    to_surah AS toSurah, to_ayah AS toAyah, actual_to_surah AS actualToSurah, actual_to_ayah AS actualToAyah
    FROM student_quran_tasks WHERE plan_id = ? AND task_date = ? AND task_type = 'review'
      AND compensation_index = ? FOR UPDATE`, [task.planId, sessionDate, task.compensationIndex]);
  const supplied = new Set((req.recitationSessionTaskIds || []).map(Number));
  return rows.length > 0 && supplied.size === rows.length && rows.every(row => supplied.has(Number(row.id)))
    && rows.some(row => !isReviewAmountComplete(row, true));
}

export function isReviewAmountComplete(row, requireTeacher = false) {
  const accepted = Number(row.teacherCompleted) === 1
    || (!requireTeacher && row.teacherCompleted == null && row.studentStatus === 'done');
  if (!accepted || row.executionState === 'partial') return false;
  // Review cycles can wrap through multiple ranges; their completion state covers the whole path.
  if (row.reviewExecution || !row.actualToSurah || !row.actualToAyah) return true;
  return Number(row.actualToSurah) > Number(row.toSurah)
    || (Number(row.actualToSurah) === Number(row.toSurah) && Number(row.actualToAyah) >= Number(row.toAyah));
}

/** Explicit dates prevent an already approved compensation from moving to a different missed day. */
export function reviewCompensationState(rows, { date, dueDates }) {
  const remaining = new Set(dueDates);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.taskDate}:${Number(row.compensationIndex || 0)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const compensations = [], regularByDate = new Map();
  let legacyCredits = 0;
  for (const group of groups.values()) {
    const first = group[0];
    if (Number(first.compensationIndex) > 0) {
      const accepted = group.every(row => isReviewAmountComplete(row, true));
      compensations.push({ index: Number(first.compensationIndex), rows: group, accepted });
      if (accepted) {
        if (first.compensatedReviewDate) remaining.delete(first.compensatedReviewDate);
        else legacyCredits += 1;
      }
    } else {
      regularByDate.set(first.taskDate, group);
      if (group.every(row => isReviewAmountComplete(row))) {
        remaining.delete(first.taskDate);
        legacyCredits += Math.max(0, ...group.map(row => Number(row.compensationDays || 0)));
      }
    }
  }
  const orderedDates = [...remaining].sort();
  for (const coveredDate of orderedDates.slice(0, legacyCredits)) remaining.delete(coveredDate);
  const regular = regularByDate.get(date) || [];
  const todayGroups = compensations.filter(group => group.rows[0].taskDate === date);
  const pending = todayGroups.find(group => !group.accepted) || null;
  const sourceDate = [...remaining].sort()[0] || null;
  const nextIndex = Math.max(0, ...todayGroups.map(group => group.index)) + 1;
  let blocked = !regular.length ? 'لا توجد مراجعة لهذا اليوم.'
    : !regular.every(row => isReviewAmountComplete(row, true)) ? 'سمّع مراجعة اليوم كاملة أولًا، ثم ابدأ التعويض.' : null;
  if (!pending && nextIndex > 255) blocked = 'استكملت عدد التعويضات المتاح لهذا اليوم.';
  return {
    owed: remaining.size, sourceDate, ranges: regularByDate.get(sourceDate) || [], regular,
    done: todayGroups.filter(group => group.accepted).length
      + (regular.length && regular.every(row => isReviewAmountComplete(row, true)) ? Math.max(0, ...regular.map(row => Number(row.compensationDays || 0))) : 0),
    pending, nextIndex, blocked,
  };
}

export async function loadReviewCompensationState(connection, { plan, date, dueDates }) {
  const [rows] = await connection.query(`SELECT id, DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate,
    compensation_index AS compensationIndex, compensation_days AS compensationDays,
    DATE_FORMAT(compensated_review_date, '%Y-%m-%d') AS compensatedReviewDate,
    track, from_page AS fromPage, from_surah AS fromSurah, from_ayah AS fromAyah,
    to_page AS toPage, to_surah AS toSurah, to_ayah AS toAyah, target_pages AS targetPages, hizb_number AS hizbNumber,
    actual_to_surah AS actualToSurah, actual_to_ayah AS actualToAyah, execution_state AS executionState,
    review_execution_json AS reviewExecution, teacher_completed AS teacherCompleted, student_status AS studentStatus
    FROM student_quran_tasks WHERE plan_id = ? AND task_type = 'review' AND task_date <= ?
      AND ${studyDateSql('task_date', 'student_quran_tasks.student_id')}
    ORDER BY task_date, compensation_index, id`, [plan.id, date]);
  return reviewCompensationState(rows, { date, dueDates });
}
