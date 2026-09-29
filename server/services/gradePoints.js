import { gradePointsWereReset } from './gradePointReset.js';
import { roundPoints, syncStudentPointBalance } from './studentPoints.js';
import { PLATFORM_POLICY_PREFIX } from '../../shared/platform-settings-catalog.js';
import { applyPlatformPolicies, readPlatformPoliciesFromRows } from './platformSettingPolicies.js';

/** Every recorded grade earns the same number of points through one ledger row. */
export const GRADE_POINTS_SOURCE = 'grade';

export const GRADE_POINT_REASONS = Object.freeze({
  attendance: 'درجة الحضور',
  memorization: 'درجة الحفظ',
  link: 'درجة الربط',
  review: 'درجة المراجعة',
  reading: 'درجة القراءة',
  track: 'جلسة المسار',
  weekly: 'الجلسة الأسبوعية',
  narration: 'يوم السرد',
});

export const dailyGradeDedupeKey = (studentId, date, component) => `grade:daily:${studentId}:${date}:${component}`;
export const weeklyGradeDedupeKey = (studentId, weekStart, component) => `grade:weekly:${studentId}:${weekStart}:${component}`;
export const narrationGradeDedupeKey = (eventStudentId) => `grade:narration:${eventStudentId}`;

export const gradeToPoints = (grade) => Math.max(0, roundPoints(grade));

const FAMILY_SETTING_KEY = 'studentPointsAddToFamily';

async function loadGradePointSettings(connection) {
  const [rows] = await connection.query(
    'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?)',
    [FAMILY_SETTING_KEY, `${PLATFORM_POLICY_PREFIX}${FAMILY_SETTING_KEY}`],
  );
  const value = rows.find((row) => row.setting_key === FAMILY_SETTING_KEY)?.setting_value;
  return applyPlatformPolicies({ [FAMILY_SETTING_KEY]: value !== 'false' }, readPlatformPoliciesFromRows(rows));
}

/**
 * Caller owns the transaction. Upserts (or removes when points <= 0) the single ledger row of a grade,
 * then moves points, store balance and the family contribution by the resulting ledger change.
 */
export async function syncGradePoints(connection, { studentId, dedupeKey, points, date, reason, actor = {} }) {
  const [[student]] = await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
  if (!student) return 0;
  const [[existing]] = await connection.query(
    'SELECT id, points, transaction_date AS date FROM student_point_transactions WHERE dedupe_key = ? FOR UPDATE',
    [dedupeKey],
  );
  const target = await gradePointsWereReset(connection, dedupeKey, date) ? 0 : gradeToPoints(points);
  if (!target) {
    if (!existing) return 0;
    await connection.query('DELETE FROM student_point_transactions WHERE id = ?', [existing.id]);
  } else {
    if (existing && roundPoints(existing.points) === target) return 0;
    await connection.query(
      `INSERT INTO student_point_transactions
        (student_id, supervisor_id, actor_role, actor_name, transaction_type, points, reason, transaction_date,
         source_type, source_id, dedupe_key)
       VALUES (?, NULL, ?, ?, 'increase', ?, ?, ?, ?, NULL, ?)
       ON DUPLICATE KEY UPDATE actor_role = VALUES(actor_role), actor_name = VALUES(actor_name),
         transaction_type = VALUES(transaction_type), points = VALUES(points), reason = VALUES(reason),
         transaction_date = VALUES(transaction_date), source_type = VALUES(source_type)`,
      [studentId, actor.role || 'system', actor.name || 'النظام', target, reason, date, GRADE_POINTS_SOURCE, dedupeKey],
    );
  }
  return syncStudentPointBalance(connection, studentId, await loadGradePointSettings(connection), {
    storeDelta: roundPoints(target - Number(existing?.points || 0)),
  });
}
