import { isUuid } from '../../shared/offline-recitation.js';

const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

/** Only the complete, currently accepted daily amount can be heard again. */
export async function loadDailyRecitationRetries(connection, teacherId, date) {
  const [rows] = await connection.query(`SELECT a.task_id AS taskId, slot.session_id AS retryOf,
      submission.plan_version AS planVersion, submission.current_plan_version AS currentPlanVersion
    FROM student_quran_recitation_daily_slots slot
    JOIN student_quran_recitation_submissions submission ON submission.session_id = slot.session_id
    JOIN student_quran_recitation_attempts a ON a.session_id = slot.session_id AND a.is_official = 1
    JOIN student_quran_tasks t ON t.id = a.task_id
    JOIN students s ON s.id = t.student_id
    WHERE slot.session_date = ? AND submission.status = 'accepted' AND t.compensation_index = 0
      AND EXISTS (SELECT 1 FROM supervisor_committees sc
        WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?)`, [date, teacherId]);
  return new Map(rows.map(row => [Number(row.taskId), row]));
}

export async function assertExplicitRecitationRetry(connection, { req, slot, task, sessionId, currentPlanVersion }) {
  if (!req.body.retryOf) return false;
  const previous = String(req.body.retryOf);
  if (!isUuid(previous) || previous === sessionId || !req.recitationTransaction
    || !['supervisor', 'reciter'].includes(req.auth?.role)) {
    throw conflict('أعد فتح مقدار التسميع كاملًا لبدء الإعادة.');
  }
  // A response lost after commit may deliver the very same retry again.
  if (slot?.sessionId === sessionId) {
    if (slot.retryOf !== previous) throw conflict('تغيّرت المحاولة المعتمدة. حدّث جلسة التسميع.');
    return false;
  }
  if (slot?.sessionId !== previous || slot.status !== 'accepted'
    || Number(slot.planId) !== Number(task.planId)) {
    throw conflict('تغيّرت المحاولة المعتمدة. حدّث جلسة التسميع قبل الإعادة.');
  }
  if (Number(req.body.planVersion) !== Number(currentPlanVersion)
    || Number(slot.currentPlanVersion || slot.planVersion) !== Number(currentPlanVersion)) {
    throw conflict('تغيّرت خطة الطالب بعد التسميع. حدّث الجلسة قبل الإعادة.');
  }
  const [parts] = await connection.query(`SELECT task_id AS taskId
    FROM student_quran_recitation_attempts WHERE session_id = ? AND is_official = 1`, [previous]);
  const supplied = new Set((req.recitationSessionTaskIds || []).map(Number));
  if (!parts.length || supplied.size !== parts.length || parts.some(part => !supplied.has(Number(part.taskId)))) {
    throw conflict('يجب إعادة تسميع المقدار السابق كاملًا دون تغيير أجزائه.');
  }
  return true;
}

export async function assertRetrySessionIdentity(connection, { req, task, sessionId, sessionDate, sessionType }) {
  const [[existing]] = await connection.query(`SELECT student_id AS studentId,
    DATE_FORMAT(session_date, '%Y-%m-%d') AS sessionDate, session_type AS sessionType,
    rejection_code AS rejectionCode,
    JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.retryOf')) AS retryOf
    FROM student_quran_recitation_submissions WHERE session_id = ? FOR UPDATE`, [sessionId]);
  if (existing && (Number(existing.studentId) !== Number(task.studentId)
    || existing.sessionDate !== sessionDate || existing.sessionType !== sessionType
    || (existing.retryOf || '') !== (req.body.retryOf || ''))) {
    throw conflict('معرّف محاولة الإعادة مستخدم لجلسة أخرى. أعد فتح التسميع.');
  }
  if (existing?.rejectionCode === 'SUPERSEDED_BY_RETRY') {
    throw conflict('اعتمدت محاولة أحدث لهذا المقدار. حدّث جلسة التسميع.');
  }
}

export async function isRecitationRetryComplete(connection, req, sessionId) {
  if (!req.body.retryOf) return true;
  const [[row]] = await connection.query(`SELECT COUNT(DISTINCT task_id) AS count
    FROM student_quran_recitation_attempts WHERE session_id = ? AND is_official = 1`, [sessionId]);
  return Number(row.count) === req.recitationSessionTaskIds.length;
}

/** Superseded deliberate attempts remain available without counting as current results. */
export async function loadRecitationRetryHistory(connection, taskIds) {
  if (!taskIds.length) return new Map();
  const [rows] = await connection.query(`SELECT a.id, a.task_id AS taskId, a.session_id AS sessionId,
      DATE_FORMAT(a.session_date, '%Y-%m-%d') AS sessionDate, a.attempt_number AS attemptNumber,
      a.evaluation_score AS evaluationScore, a.teacher_completed AS teacherCompleted,
      a.warning_count AS warningCount, a.hesitation_count AS hesitationCount, a.mistake_count AS mistakeCount,
      DATE_FORMAT(a.evaluated_at, '%Y-%m-%d %H:%i:%s') AS evaluatedAt
    FROM student_quran_recitation_attempts a
    JOIN student_quran_recitation_submissions submission ON submission.session_id = a.session_id
    WHERE a.task_id IN (?) AND a.is_official = 0 AND submission.rejection_code = 'SUPERSEDED_BY_RETRY'
    ORDER BY a.attempt_number DESC`, [taskIds]);
  const history = new Map();
  rows.forEach(row => {
    const key = `${Number(row.taskId)}:${row.sessionDate}`;
    history.set(key, [...(history.get(key) || []), { ...row, teacherCompleted: Boolean(Number(row.teacherCompleted)) }]);
  });
  return history;
}
