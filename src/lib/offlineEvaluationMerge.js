import { hasAcceptedRecitationTask } from './recitationTaskResults.js';
import { mergeRecitationDeliveryReceipts } from './recitationDeliveryReceipts.js';
import { advanceRecitationTaskQueue, canAdvanceRecitationSession } from './recitationTaskQueue.js';

const UNSYNCED_RECITATION_STATUSES = new Set(['pending', 'syncing', 'invalid_sequence', 'failed']);
const LOCAL_ATTENDANCE_STATUSES = new Set(['pending', 'syncing', 'failed']);

// A device acknowledgement is useful only for the exact task that the server accepted.
const protectsAcceptedTask = (session, item, task) => hasAcceptedRecitationTask(session, item)
  && Number(session.studentId) === Number(task.studentId)
  && Number(item.planId) === Number(task.planId)
  && item.taskType === task.taskType
  && (!task.planVersion || Number(item.planVersion) === Number(task.planVersion))
  && !task.evaluatedAt && ((Number(task.attemptCount) || 0) <= 0)
  && item.result.teacherCompleted === true;

export function mergeCommittedOfflineEvaluation(evaluation, sessions = [], actions = []) {
  if (!evaluation) return evaluation;
  const evaluationDate = String(evaluation.date || '');
  const pendingSessions = sessions.filter((session) => (
    (UNSYNCED_RECITATION_STATUSES.has(session.status) || session.status === 'synced'
      || session.tasks?.some((item) => hasAcceptedRecitationTask(session, item)))
    && String(session.sessionDate || '') === evaluationDate
  ));
  let mergedEvaluation = evaluation;
  const pendingStudentIds = new Set();
  pendingSessions.forEach((session) => {
    const taskById = new Map(
      [...(mergedEvaluation.taskQueue || []), ...(mergedEvaluation.tasks || [])]
        .map((task) => [Number(task.id), task]),
    );
    const sessionTasks = (session.tasks || [])
      .map((item) => {
        const task = taskById.get(Number(item.taskId));
        if (!task) return null;
        // A transport failure protects only a complete durable submission, not
        // an unsubmitted placeholder in a partially accepted batch.
        if (session.status === 'failed' && !item.synced
          && (!item.payload || Number(item.planId) !== Number(task.planId)
            || Number(session.studentId) !== Number(task.studentId)
            || item.taskType !== task.taskType
            || (task.planVersion && Number(item.planVersion) !== Number(task.planVersion)))) return null;
        if ((item.synced || !UNSYNCED_RECITATION_STATUSES.has(session.status))
          && !protectsAcceptedTask(session, item, task)) return null;
        return task;
      })
      .filter(Boolean);
    if (!sessionTasks.length) return;
    if (Number(session.studentId)) pendingStudentIds.add(Number(session.studentId));
    sessionTasks.forEach((task) => pendingStudentIds.add(Number(task.studentId)));
    mergedEvaluation = advanceRecitationTaskQueue(mergedEvaluation, sessionTasks, { promote: canAdvanceRecitationSession(session) });
  });
  const latestAttendanceByStudent = new Map();
  actions.forEach((action) => {
    const newerReceipt = action.status === 'synced' && Number(action.result?.serverRecordedAt) > Number(evaluation.attendanceSnapshotAt || 0);
    if ((!LOCAL_ATTENDANCE_STATUSES.has(action.status) && !newerReceipt)
      || action.actionType !== 'student_attendance'
      || String(action.payload?.date || '') !== evaluationDate) return;
    latestAttendanceByStudent.set(Number(action.payload?.studentId), action.payload?.status || '');
  });
  const absentStudentIds = new Set((mergedEvaluation.students || []).filter((student) => (
    ['absent', 'excused'].includes(latestAttendanceByStudent.get(Number(student.studentId)) || student.attendanceStatus)
  )).map((student) => Number(student.studentId)));
  const remainingTasks = (mergedEvaluation.tasks || []).filter((task) => !absentStudentIds.has(Number(task.studentId)));
  return {
    ...mergedEvaluation,
    deliveryReceipts: mergeRecitationDeliveryReceipts(evaluation, sessions),
    tasks: remainingTasks,
    taskQueue: (mergedEvaluation.taskQueue || []).filter((task) => !absentStudentIds.has(Number(task.studentId))),
    students: (mergedEvaluation.students || [])
      .map((student) => ({
        ...student,
        ...(latestAttendanceByStudent.has(Number(student.studentId))
          ? { attendanceStatus: latestAttendanceByStudent.get(Number(student.studentId)) }
          : {}),
        ...(pendingStudentIds.has(Number(student.studentId))
          ? {
              recitationFinished: false,
              recitationPending: !remainingTasks.some((task) => (
                Number(task.studentId) === Number(student.studentId)
              )),
            }
          : {}),
      }))
      // The task list decides visibility using actual completion and remaining work.
      .filter((student) => !['absent', 'excused'].includes(student.attendanceStatus)),
  };
}
