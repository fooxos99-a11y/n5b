import { getBusinessDate } from '../../shared/business-date.js';

/** Corrections replace a complete, current-day session atomically, before dependent recitations. */
export async function assertRecitationCorrection(connection, { req, slot, task, sessionDate, currentPlanVersion }) {
  const reject = (message) => { throw Object.assign(new Error(message), { statusCode: 409 }); };
  if (!req.recitationTransaction || req.body.correctionOf !== slot.sessionId) reject('تغيّرت الجلسة. حدّث السجل قبل التصحيح.');
  if (slot.evaluatorRole !== req.auth.role || Number(slot.evaluatorId) !== Number(req.auth.id)) reject('تصحيح التقييم متاح للمعلم الذي سجّله فقط.');
  if (sessionDate !== getBusinessDate()) reject('يمكن تصحيح جلسة اليوم فقط.');
  if (Number(slot.planId) !== Number(task.planId) || Number(slot.planVersion) !== Number(currentPlanVersion)) reject('تغيّرت الخطة بعد التسميع؛ لا يمكن تصحيح هذه الجلسة.');
  const [parts] = await connection.query(`SELECT task_id AS taskId FROM student_quran_recitation_attempts
    WHERE session_id = ? AND is_official = 1 FOR UPDATE`, [slot.sessionId]);
  const supplied = new Set(req.recitationSessionTaskIds.map(Number));
  if (!parts.length || supplied.size !== parts.length || parts.some(part => !supplied.has(Number(part.taskId)))) reject('يجب تصحيح جميع مقاطع الجلسة معًا.');
  const [[later]] = await connection.query(`SELECT a.id FROM student_quran_recitation_attempts a
    JOIN student_quran_tasks t ON t.id = a.task_id
    WHERE t.plan_id = ? AND a.is_official = 1 AND a.id >
      (SELECT MAX(previous.id) FROM student_quran_recitation_attempts previous WHERE previous.session_id = ?)
    LIMIT 1 FOR UPDATE`, [task.planId, slot.sessionId]);
  if (later) reject('توجد جلسة أحدث تعتمد على هذا التقييم؛ لا يمكن تغييره.');
}
