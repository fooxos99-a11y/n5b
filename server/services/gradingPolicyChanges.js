import { createHash } from 'node:crypto';
import { GRADING_POLICY_SETTING_KEY, gradingMaxima, parseGradingPolicy, normalizeGradingPolicy } from '../../shared/grading-policy.js';
import { changeCurrentGradingWeek } from '../../shared/grading-week-change.js';
import { addDays, freezeWeekPolicy, saveGradingPolicy, weekStartOf } from './grading.js';

const EFFECTIVE_KEY = 'gradingPolicyEffectiveFrom';
const revisionOf = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function loadGradingPolicyChange(connection, today, { lock = false } = {}) {
  const [rows] = await connection.query(
    `SELECT setting_key AS settingKey, setting_value AS value FROM app_settings WHERE setting_key IN (?, ?) ORDER BY setting_key${lock ? ' FOR UPDATE' : ''}`,
    [GRADING_POLICY_SETTING_KEY, EFFECTIVE_KEY],
  );
  const policy = parseGradingPolicy(rows.find(row => row.settingKey === GRADING_POLICY_SETTING_KEY)?.value);
  const [[week]] = await connection.query('SELECT policy_json AS policy FROM grading_week_policies WHERE week_start = ?' + (lock ? ' FOR UPDATE' : ''), [weekStartOf(today)]);
  const effectiveFrom = rows.find(row => row.settingKey === EFFECTIVE_KEY)?.value || null;
  return { policy, maxima: gradingMaxima(policy), effectiveFrom,
    revision: revisionOf([policy, effectiveFrom, week?.policy || null]), currentWeekPolicy: parseGradingPolicy(week?.policy || policy) };
}

/** Settings and the active week's schedule change together, with stale-editor protection. */
export async function saveGradingPolicyChange(pool, { policy: rawPolicy, applyFrom, revision, today }) {
  // Installed older clients have no timing/revision fields: keep their edits deferred to next week.
  const legacyClient = applyFrom === undefined && revision === undefined;
  if (legacyClient) applyFrom = 'nextWeek';
  if (!['today', 'nextWeek'].includes(applyFrom)) throw Object.assign(new Error('اختر موعد تطبيق البرنامج: اليوم أو الأسبوع القادم.'), { status: 422 });
  if (!legacyClient && (!revision || typeof revision !== 'string')) throw Object.assign(new Error('أعد تحميل إعدادات البرنامج قبل الحفظ.'), { status: 409 });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const current = await loadGradingPolicyChange(connection, today, { lock: true });
    if (!legacyClient && revision !== current.revision) throw Object.assign(new Error('تغيّرت الإعدادات من جلسة أخرى. أعد تحميلها قبل التعديل.'), { status: 409 });
    const policy = normalizeGradingPolicy(rawPolicy, { includeDayPolicies: false });
    const weekStart = weekStartOf(today);
    const [[history]] = await connection.query(`SELECT DATE_FORMAT(MIN(startDate), '%Y-%m-%d') AS firstDate FROM (
      SELECT COALESCE(start_date, DATE(created_at)) AS startDate FROM student_quran_plans
      UNION ALL SELECT task_date FROM student_quran_tasks
    ) history`);
    if (history?.firstDate) {
      const weeks = [];
      for (let date = weekStartOf(history.firstDate); date < weekStart; date = addDays(date, 7)) weeks.push(date);
      for (let offset = 0; offset < weeks.length; offset += 100) {
        const batch = weeks.slice(offset, offset + 100);
        await connection.query(`INSERT IGNORE INTO grading_week_policies (week_start, policy_json) VALUES ${batch.map(() => '(?, ?)').join(', ')}`,
          batch.flatMap(date => [date, JSON.stringify(current.policy)]));
      }
    }
    await freezeWeekPolicy(connection, weekStart, current.policy);
    if (applyFrom === 'today') {
      const [grades] = await connection.query('SELECT DISTINCT component FROM student_daily_grades WHERE grade_date = ?', [today]);
      const [[attempt]] = await connection.query(`SELECT t.id FROM student_quran_tasks t
        WHERE t.task_date = ? AND (t.evaluated_at IS NOT NULL OR t.execution_state = 'partial' OR t.student_status = 'done') LIMIT 1`, [today]);
      const changed = changeCurrentGradingWeek({ previous: current.currentWeekPolicy, desired: policy, weekStart, today,
        lockedCore: Boolean(attempt) || grades.some(row => row.component !== 'reading'), lockedReading: grades.some(row => row.component === 'reading') });
      await connection.query('UPDATE grading_week_policies SET policy_json = ? WHERE week_start = ?', [JSON.stringify(changed), weekStart]);
    }
    await saveGradingPolicy(connection, rawPolicy?.dayPolicies ? policy : rawPolicy);
    const effectiveFrom = applyFrom === 'today' ? today : addDays(weekStart, 7);
    await connection.query('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [EFFECTIVE_KEY, effectiveFrom]);
    const result = await loadGradingPolicyChange(connection, today);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
