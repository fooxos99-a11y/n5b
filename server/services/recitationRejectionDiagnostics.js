import { randomUUID } from 'node:crypto';
import { isUuid } from '../../shared/offline-recitation.js';
import { canTeacherExecuteQuranTask } from '../../shared/quran-execution-policy.js';
import { studyDateSql } from './seasonalHolidays.js';
import { uncompensatedTaskSql } from './compensationPlanCredit.js';

const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const safeCode = value => /^[A-Z][A-Z0-9_]{0,79}$/.test(String(value || '')) ? String(value) : null;

/** Inspect the same selection conditions before rollback, without storing the evaluation payload. */
export async function diagnoseUnavailableRecitationTask(connection, {
  supervisorId, taskId, sessionDate, taskEndDate, settings, allowCompletedCompensation = false, explicitRetry = false,
}) {
  const [[row]] = await connection.query(`SELECT t.student_id AS studentId, t.plan_id AS planId,
      DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate, t.task_type AS taskType,
      t.compensation_index AS compensationIndex, t.teacher_completed AS teacherCompleted,
      (p.id IS NOT NULL AND s.id IS NOT NULL) AS contextExists,
      EXISTS (SELECT 1 FROM supervisor_committees sc
        WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?) AS inTeacherScope,
      (SELECT ar.status FROM attendance_records ar
        WHERE ar.student_id = t.student_id AND ar.record_date = ? LIMIT 1) AS attendanceStatus,
      (${studyDateSql('t.task_date', 't.student_id')}) AS studyDateAllowed,
      (${uncompensatedTaskSql('t')}) AS uncompensated,
      EXISTS (SELECT 1 FROM student_quran_recitation_attempts attempt
        WHERE attempt.task_id = t.id AND attempt.is_official = 1
          AND attempt.teacher_completed = 1) AS hasSuccessfulAttempt,
      (SELECT newer.id FROM student_quran_tasks newer
        WHERE newer.plan_id = t.plan_id AND newer.task_date <= ? AND newer.task_date > t.task_date
          AND newer.task_type = t.task_type AND newer.track = t.track
          AND newer.from_page = t.from_page AND newer.to_page = t.to_page
          AND COALESCE(newer.from_surah, 0) = COALESCE(t.from_surah, 0)
          AND COALESCE(newer.from_ayah, 0) = COALESCE(t.from_ayah, 0)
          AND COALESCE(newer.to_surah, 0) = COALESCE(t.to_surah, 0)
          AND COALESCE(newer.to_ayah, 0) = COALESCE(t.to_ayah, 0)
        ORDER BY newer.task_date DESC, newer.id DESC LIMIT 1) AS newerTaskId
    FROM student_quran_tasks t
    LEFT JOIN student_quran_plans p ON p.id = t.plan_id
    LEFT JOIN students s ON s.id = t.student_id
    WHERE t.id = ? LIMIT 1`, [supervisorId, sessionDate, taskEndDate, taskId]);
  if (!row) return { reason: 'TASK_NOT_FOUND', failedChecks: ['TASK_NOT_FOUND'] };
  // Do not disclose another teacher's student or plan, even in a diagnostic response.
  if (!Number(row.inTeacherScope)) return { reason: 'TASK_OUTSIDE_SCOPE', failedChecks: ['TASK_OUTSIDE_SCOPE'] };
  const checks = {
    TASK_CONTEXT_MISSING: !Number(row.contextExists),
    ATTENDANCE_REQUIRED: !['present', 'late'].includes(row.attendanceStatus),
    TASK_TYPE_UNSUPPORTED: !['memorization', 'review', 'link'].includes(row.taskType),
    TASK_DATE_EXCLUDED: !Number(row.studyDateAllowed),
    DAY_ALREADY_COMPENSATED: !Number(row.uncompensated),
    TASK_NOT_DUE: row.taskDate > taskEndDate,
    TASK_ALREADY_COMPLETED: !explicitRetry && row.teacherCompleted != null && Number(row.teacherCompleted) !== 0
      && !Number(row.hasSuccessfulAttempt)
      && !(row.taskType === 'review' && Number(row.compensationIndex) > 0 && allowCompletedCompensation),
    TASK_REPLACED: !explicitRetry && Boolean(row.newerTaskId),
    EXECUTION_NOT_ALLOWED: !canTeacherExecuteQuranTask(settings, row.taskType),
  };
  const failedChecks = Object.keys(checks).filter(key => checks[key]);
  return {
    reason: failedChecks[0] || 'SELECTION_CHANGED', failedChecks,
    studentId: positiveId(row.studentId), planId: positiveId(row.planId),
    taskDate: row.taskDate, taskType: row.taskType,
    attendanceStatus: row.attendanceStatus || '', newerTaskId: positiveId(row.newerTaskId),
  };
}

export async function recordUnavailableRecitationTask({ connection, req, supervisorId, taskId, sessionDate, taskEndDate, settings },
  write = record => console.warn(JSON.stringify(record))) {
  const requestId = isUuid(req.traceId) ? req.traceId : randomUUID();
  let diagnostic;
  try {
    diagnostic = await diagnoseUnavailableRecitationTask(connection, {
      supervisorId, taskId, sessionDate, taskEndDate, settings,
      explicitRetry: Boolean(req.body.retryOf),
      allowCompletedCompensation: Boolean(req.recitationTransaction?.superseded
        && req.recitationSessionTaskIds?.map(Number).includes(Number(taskId))),
    });
  } catch (error) {
    // A failed diagnostic query must preserve the original rejection and never log SQL or credentials.
    diagnostic = { reason: 'DIAGNOSTICS_UNAVAILABLE', failedChecks: [], errorCode: safeCode(error.code) };
  }
  write({
    event: 'recitation_task_rejected', recordedAt: new Date().toISOString(), requestId,
    supervisorId: positiveId(supervisorId), taskId: positiveId(taskId),
    sessionId: isUuid(req.body?.sessionId) ? req.body.sessionId : null,
    sessionDate, taskEndDate, status: 404, code: 'RECITATION_TASK_UNAVAILABLE', ...diagnostic,
  });
  const reason = ['TASK_NOT_FOUND', 'TASK_OUTSIDE_SCOPE', 'TASK_CONTEXT_MISSING'].includes(diagnostic.reason)
    ? 'TASK_UNAVAILABLE' : diagnostic.reason;
  return { code: 'RECITATION_TASK_UNAVAILABLE', reason, requestId };
}

/** Batch HTTP 200 can contain rejected tasks; record that rejection independently of HTTP metrics. */
export function recordRecitationBatchRejection(req, session, failedTask,
  write = record => console.warn(JSON.stringify(record))) {
  if (!failedTask) return;
  write({ event: 'recitation_batch_rejected', recordedAt: new Date().toISOString(),
    requestId: isUuid(failedTask.requestId) ? failedTask.requestId : isUuid(req.traceId) ? req.traceId : null,
    supervisorId: positiveId(req.auth?.id), studentId: positiveId(session.studentId),
    sessionId: isUuid(session.sessionId) ? session.sessionId : null,
    taskId: positiveId(failedTask.taskId),
    result: safeCode(String(failedTask.result || '').toUpperCase()),
    code: safeCode(failedTask.data?.code), reason: safeCode(failedTask.data?.reason),
  });
}
