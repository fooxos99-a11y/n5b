import { hasAcceptedRecitationTask } from './recitationTaskResults.js';

export const recitationDeliveryLabels = {
  local_saved: 'محفوظ على الجهاز — بانتظار اعتماد السيرفر',
  local_failed: 'تعذر اعتماد السيرفر — النتيجة محفوظة على الجهاز',
  local_rejected: 'لم يعتمد السيرفر النتيجة',
  server_saved: 'معتمد في المنصة',
};

export function mergeRecitationDeliveryReceipts(evaluation, sessions = []) {
  const receipts = new Map((evaluation.deliveryReceipts || []).map(row => [Number(row.taskId), row]));
  const tasks = new Map([...(evaluation.taskQueue || []), ...(evaluation.tasks || [])].map(task => [Number(task.id), task]));
  const students = new Map((evaluation.students || []).map(student => [Number(student.studentId), student]));
  const orderedSessions = [...sessions].sort((a, b) => (
    String(b.committedAtLocal || b.createdAtLocal || '').localeCompare(String(a.committedAtLocal || a.createdAtLocal || ''))
    || String(b.sessionId || '').localeCompare(String(a.sessionId || ''))
    || (b.tasks || []).filter((item) => hasAcceptedRecitationTask(b, item)).length
      - (a.tasks || []).filter((item) => hasAcceptedRecitationTask(a, item)).length
  ));
  for (const session of orderedSessions) {
    if (session.sessionDate !== evaluation.date) continue;
    mergeSessionDeliveryReceipts(session, receipts, tasks, students);
  }
  return [...receipts.values()];
}

/** Merge only receipts matching the student and plan identity, keeping authoritative receipts first. */
function mergeSessionDeliveryReceipts(session, receipts, tasks, students) {
  for (const item of session.tasks || []) {
    if (receipts.has(Number(item.taskId))) continue;
    const task = tasks.get(Number(item.taskId));
    if (task && (Number(session.studentId) !== Number(task.studentId)
      || (item.planId && task.planId && Number(item.planId) !== Number(task.planId))
      || (item.planVersion && task.planVersion && Number(item.planVersion) !== Number(task.planVersion)))) continue;
    const accepted = hasAcceptedRecitationTask(session, item);
    const student = students.get(Number(session.studentId));
    const _resolveStatus = () => {
      if (accepted) {
        return 'server_saved';
      }
      if (session.status === 'failed') {
        return 'local_failed';
      }
      if (['conflict', 'invalid_sequence', 'rejected_permission', 'rejected_duplicate'].includes(session.status)) {
        return 'local_rejected';
      }
      return 'local_saved';
    };
    receipts.set(Number(item.taskId), {
      taskId: item.taskId, studentId: session.studentId, studentName: student?.studentName || 'الطالب',
      taskType: item.taskType || task?.taskType, taskDate: item.taskDate || task?.taskDate || session.sessionDate,
      track: item.track || task?.track,
      status: _resolveStatus(),
      error: accepted ? '' : session.lastError || '',
    });
  }
}
