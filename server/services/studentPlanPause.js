import { STUDENT_PLAN_PAUSE_KEY, parseStudentPlanPause, changeStudentPlanPause, studentPlanPauseStatus } from '../../shared/student-plan-pause.js';
import { getBusinessDate } from '../../shared/business-date.js';

export async function loadStudentPlanPause(connection) {
  const [[row]] = await connection.query('SELECT setting_value AS pause FROM app_settings WHERE setting_key = ?', [STUDENT_PLAN_PAUSE_KEY]);
  return parseStudentPlanPause(row?.pause);
}

export async function saveStudentPlanPause(pool, { paused, revision, actor, date = getBusinessDate() }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
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
