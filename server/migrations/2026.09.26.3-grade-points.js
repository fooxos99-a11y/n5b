import { PLATFORM_POLICY_PREFIX } from '../../shared/platform-settings-catalog.js';
import { applyPlatformPolicies, readPlatformPoliciesFromRows } from '../services/platformSettingPolicies.js';

export const version = '2026.09.26.3';

// Points now come only from recorded grades (one point per grade point), so they carry decimals.
export const REMOVED_POINT_SOURCES = Object.freeze([
  'attendance',
  'quran_plan',
  'quran_execution',
  'quran_evaluation',
  'quran_test',
  'practice_completion',
  'learning_path',
  'inactive_source_adjustment',
]);

export const REMOVED_SETTING_KEYS = Object.freeze([
  'pointsSystemEnabled',
  'attendancePoints',
  'manualLateAttendancePoints',
  'excusedAttendancePoints',
  'lateEveryMinutes',
  'lateDeductionPoints',
  'memorizationPoints',
  'reviewPoints',
  'linkPoints',
  'memorizationRepeatPointValue',
  'masteryRepeatPointValue',
  'memorizationListeningPointValue',
  'masteryListeningPointValue',
  'quranCompensationPointsPercent',
  'quranExtraPointsPercent',
]);

// Family-origin rows never count toward a family's student contribution (same rule as the server).
const FAMILY_ORIGIN_SOURCES = ['family_adjustment', 'family_evaluation', 'family_points_setting_adjustment'];

const DAILY_REASONS = `CASE component
  WHEN 'attendance' THEN 'درجة الحضور' WHEN 'memorization' THEN 'درجة الحفظ' WHEN 'link' THEN 'درجة الربط'
  WHEN 'review' THEN 'درجة المراجعة' ELSE 'درجة القراءة' END`;
const WEEKLY_REASONS = "CASE component WHEN 'track' THEN 'جلسة المسار' ELSE 'الجلسة الأسبوعية' END";
const LEDGER_TOTAL = "GREATEST(0, COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE -points END), 0))";

async function studentPointsAddToFamily(connection) {
  const key = 'studentPointsAddToFamily';
  const [rows] = await connection.query(
    'SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?)',
    [key, `${PLATFORM_POLICY_PREFIX}${key}`],
  );
  const value = rows.find((row) => row.setting_key === key)?.setting_value;
  return applyPlatformPolicies({ [key]: value !== 'false' }, readPlatformPoliciesFromRows(rows))[key];
}

async function widenPointColumns(connection) {
  await connection.query('ALTER TABLE student_point_transactions MODIFY COLUMN points DECIMAL(10,2) NOT NULL');
  await connection.query(`ALTER TABLE students
    MODIFY COLUMN points DECIMAL(12,2) NOT NULL DEFAULT 0,
    MODIFY COLUMN store_balance DECIMAL(12,2) NOT NULL DEFAULT 0`);
  await connection.query(`ALTER TABLE committees
    MODIFY COLUMN points DECIMAL(12,2) NOT NULL DEFAULT 0,
    MODIFY COLUMN student_points_contribution DECIMAL(12,2) NOT NULL DEFAULT 0`);
  await connection.query(`ALTER TABLE student_balance_adjustments
    MODIFY COLUMN delta DECIMAL(12,2) NOT NULL,
    MODIFY COLUMN balance_before DECIMAL(12,2) NOT NULL,
    MODIFY COLUMN balance_after DECIMAL(12,2) NOT NULL`);
}

async function rebuildGradeLedger(connection) {
  const sources = [...REMOVED_POINT_SOURCES, 'grade'];
  await connection.query(
    `DELETE FROM student_point_transactions WHERE source_type IN (${sources.map(() => '?').join(', ')})`,
    sources,
  );
  await connection.query(`INSERT INTO student_point_transactions
      (student_id, actor_role, actor_name, transaction_type, points, reason, transaction_date, source_type, dedupe_key)
    SELECT student_id, 'system', 'النظام', 'increase', ROUND(grade, 2), ${DAILY_REASONS}, grade_date, 'grade',
      CONCAT('grade:daily:', student_id, ':', DATE_FORMAT(grade_date, '%Y-%m-%d'), ':', component)
    FROM student_daily_grades WHERE ROUND(grade, 2) > 0`);
  await connection.query(`INSERT INTO student_point_transactions
      (student_id, actor_role, actor_name, transaction_type, points, reason, transaction_date, source_type, dedupe_key)
    SELECT student_id, 'system', 'النظام', 'increase', ROUND(grade, 2), ${WEEKLY_REASONS}, week_start, 'grade',
      CONCAT('grade:weekly:', student_id, ':', DATE_FORMAT(week_start, '%Y-%m-%d'), ':', component)
    FROM student_weekly_components WHERE ROUND(grade, 2) > 0`);
  await connection.query(`INSERT INTO student_point_transactions
      (student_id, actor_role, actor_name, transaction_type, points, reason, transaction_date, source_type, dedupe_key)
    SELECT es.student_id, 'system', 'النظام', 'increase', ROUND(es.final_score, 2), 'يوم السرد',
      COALESCE((SELECT DATE(MAX(p.evaluated_at)) FROM narration_event_parts p WHERE p.event_student_id = es.id), DATE(es.updated_at)),
      'grade', CONCAT('grade:narration:', es.id)
    FROM narration_event_students es JOIN students s ON s.id = es.student_id
    WHERE ROUND(es.final_score, 2) > 0`);
}

// Removed automatic sources also cached their award on the source rows.
async function clearRemovedPointCaches(connection) {
  await connection.query('UPDATE attendance_records SET points = 0 WHERE points <> 0');
  await connection.query('UPDATE supervisor_attendance_records SET points = 0 WHERE points <> 0');
  await connection.query('UPDATE student_quran_tasks SET points = 0 WHERE points <> 0');
  await connection.query('UPDATE student_quran_execution_segments SET points_awarded = 0 WHERE points_awarded <> 0');
}

// The wallet moves by exactly the change of earned points, keeping purchases, refunds and wallet edits.
async function recomputeStudentBalances(connection) {
  const ledger = `SELECT student_id, ${LEDGER_TOTAL} AS total FROM student_point_transactions GROUP BY student_id`;
  await connection.query(`UPDATE students s LEFT JOIN (${ledger}) t ON t.student_id = s.id
    SET s.store_balance = GREATEST(0, s.store_balance + COALESCE(t.total, 0) - s.points)`);
  await connection.query(`UPDATE students s LEFT JOIN (${ledger}) t ON t.student_id = s.id
    SET s.points = COALESCE(t.total, 0)`);
}

async function recomputeFamilyContributions(connection) {
  if (!await studentPointsAddToFamily(connection)) return;
  const placeholders = FAMILY_ORIGIN_SOURCES.map(() => '?').join(', ');
  await connection.query(`UPDATE committees c LEFT JOIN (
      SELECT contributions.committeeId, SUM(contributions.total) AS total FROM (
        SELECT s.committee_id AS committeeId,
          GREATEST(0, COALESCE(SUM(CASE WHEN t.transaction_type = 'increase' THEN t.points ELSE -t.points END), 0)) AS total
        FROM students s
        LEFT JOIN student_point_transactions t ON t.student_id = s.id AND t.source_type NOT IN (${placeholders})
        WHERE s.committee_id IS NOT NULL GROUP BY s.id, s.committee_id
      ) contributions GROUP BY contributions.committeeId
    ) f ON f.committeeId = c.id
    SET c.points = GREATEST(0, c.points + COALESCE(f.total, 0) - c.student_points_contribution),
      c.student_points_contribution = COALESCE(f.total, 0)`, FAMILY_ORIGIN_SOURCES);
}

async function removeObsoleteSettings(connection) {
  const keys = REMOVED_SETTING_KEYS.flatMap((key) => [key, `${PLATFORM_POLICY_PREFIX}${key}`]);
  await connection.query(`DELETE FROM app_settings WHERE setting_key IN (${keys.map(() => '?').join(', ')})`, keys);
}

export async function up(connection) {
  // Column changes commit implicitly, so they run before the data transaction.
  await widenPointColumns(connection);
  await connection.beginTransaction();
  try {
    await rebuildGradeLedger(connection);
    await clearRemovedPointCaches(connection);
    await recomputeStudentBalances(connection);
    await recomputeFamilyContributions(connection);
    await removeObsoleteSettings(connection);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
