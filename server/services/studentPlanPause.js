import { STUDENT_PLAN_PAUSE_KEY, parseStudentPlanPause, changeStudentPlanPause, studentPlanPauseStatus } from '../../shared/student-plan-pause.js';
import { getBusinessDate } from '../../shared/business-date.js';

export async function loadStudentPlanPause(connection, studentId = null) {
  if (studentId !== null) {
    const [[row]] = await connection.query('SELECT state_json AS pause FROM student_plan_pauses WHERE student_id = ?', [studentId]);
    return parseStudentPlanPause(row?.pause);
  }
  const [[row]] = await connection.query('SELECT setting_value AS pause FROM app_settings WHERE setting_key = ?', [STUDENT_PLAN_PAUSE_KEY]);
  return parseStudentPlanPause(row?.pause);
}

export async function loadIndividualStudentPlanPauses(connection) {
  const [rows] = await connection.query('SELECT student_id AS studentId, state_json AS pause FROM student_plan_pauses');
  return Object.fromEntries(rows.map(row => [row.studentId, parseStudentPlanPause(row.pause)]));
}

export async function assertStudentPlanRunning(connection, studentId) {
  const states = await Promise.all([loadStudentPlanPause(connection), loadStudentPlanPause(connection, studentId)]);
  if (states.some(state => studentPlanPauseStatus(state).paused)) throw Object.assign(new Error('خطة الطالب متوقفة. استأنفها قبل تسجيل الإنجاز.'), { status: 422, statusCode: 422 });
}

export async function saveStudentPlanPause(pool, { paused, revision, actor, studentId = null, date = getBusinessDate() }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (studentId !== null) {
      const [[student]] = await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
      if (!student) throw Object.assign(new Error('الطالب غير موجود.'), { status: 404 });
      const state = changeStudentPlanPause(await loadStudentPlanPause(connection, studentId), { paused, revision, date, actor });
      const json = JSON.stringify(state);
      if (Buffer.byteLength(json, 'utf8') > 60000) throw Object.assign(new Error('سجل إيقاف الطالب تجاوز الحد المسموح.'), { status: 422 });
      await connection.query('INSERT INTO student_plan_pauses(student_id, state_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)', [studentId, json]);
      await connection.commit();
      return studentPlanPauseStatus(state);
    }
    // Acquire an exclusive key lock immediately; INSERT IGNORE can deadlock two subsequent lock upgrades.
    await connection.query('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_key = VALUES(setting_key)', [STUDENT_PLAN_PAUSE_KEY, JSON.stringify({ revision: 0, periods: [] })]);
    const [[row]] = await connection.query('SELECT setting_value AS pause FROM app_settings WHERE setting_key = ? FOR UPDATE', [STUDENT_PLAN_PAUSE_KEY]);
    const state = changeStudentPlanPause(row.pause, { paused, revision, date, actor });
    const json = JSON.stringify(state);
    if (Buffer.byteLength(json, 'utf8') > 60000) throw Object.assign(new Error('تعذر إضافة فترة إيقاف جديدة. تواصل مع الدعم.'), { status: 422 });
    await connection.query('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?', [json, STUDENT_PLAN_PAUSE_KEY]);
    await connection.commit();
    return studentPlanPauseStatus(state);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
