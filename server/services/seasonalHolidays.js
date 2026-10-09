import { SEASONAL_HOLIDAYS_KEY, normalizeSeasonalHolidays, isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { loadStudentPlanPause } from './studentPlanPause.js';
import { studentPlanPauseHolidays } from '../../shared/student-plan-pause.js';

export async function loadSeasonalHolidays(connection, throughDate, studentId = null) {
  const [[row]] = await connection.query('SELECT setting_value AS holidays FROM app_settings WHERE setting_key = ?', [SEASONAL_HOLIDAYS_KEY]);
  return [...normalizeSeasonalHolidays(row?.holidays || []), ...studentPlanPauseHolidays(await loadStudentPlanPause(connection), throughDate),
    ...(studentId === null ? [] : studentPlanPauseHolidays(await loadStudentPlanPause(connection, studentId), throughDate))];
}

export async function assertStudyDate(connection, date, studentId = null) {
  if (isSeasonalHoliday(date, await loadSeasonalHolidays(connection, '9999-12-31', studentId))) {
    throw Object.assign(new Error('لا يوجد تحضير أو إنجاز مطلوب خلال الإجازة أو إيقاف الخطط.'), { status: 422, statusCode: 422 });
  }
}

/** A fixed server-owned SQL predicate also excludes tasks generated before a holiday was added. */
export function studyDateSql(column, studentColumn = null) {
  if (!/^[a-z_]+(?:\.[a-z_]+)?$/.test(column)) throw new Error('Invalid study date column');
  if (studentColumn && !/^[a-z_]+(?:\.[a-z_]+)?$/.test(studentColumn)) throw new Error('Invalid study student column');
  return `NOT EXISTS (SELECT 1 FROM app_settings holiday_setting
    CROSS JOIN JSON_TABLE(IF(JSON_VALID(holiday_setting.setting_value), holiday_setting.setting_value, '[]'), '$[*]'
      COLUMNS (start_date VARCHAR(10) PATH '$.startDate', end_date VARCHAR(10) PATH '$.endDate')) holiday_dates
    WHERE holiday_setting.setting_key = 'seasonalHolidays' AND ${column} BETWEEN holiday_dates.start_date AND holiday_dates.end_date)
    AND NOT EXISTS (SELECT 1 FROM app_settings pause_setting
      CROSS JOIN JSON_TABLE(IF(JSON_VALID(pause_setting.setting_value), pause_setting.setting_value, '{}'), '$.periods[*]'
        COLUMNS (start_date VARCHAR(10) PATH '$.startDate', end_date VARCHAR(10) PATH '$.endDate' NULL ON EMPTY)) pause_dates
      WHERE pause_setting.setting_key = 'studentPlanPause' AND ${column} BETWEEN pause_dates.start_date AND COALESCE(pause_dates.end_date, '9999-12-31'))${studentColumn ? `
    AND NOT EXISTS (SELECT 1 FROM student_plan_pauses individual_pause
      CROSS JOIN JSON_TABLE(individual_pause.state_json, '$.periods[*]'
        COLUMNS (start_date VARCHAR(10) PATH '$.startDate', end_date VARCHAR(10) PATH '$.endDate' NULL ON EMPTY)) individual_dates
      WHERE individual_pause.student_id = ${studentColumn} AND ${column} BETWEEN individual_dates.start_date AND COALESCE(individual_dates.end_date, '9999-12-31'))` : ''}`;
}

export function studyWeekSql(column, studentColumn = null) {
  const predicate = studyDateSql(column, studentColumn);
  return `(${Array.from({length:7}, (_value, day) => `(${predicate.replaceAll(`${column} BETWEEN`, `DATE_ADD(${column}, INTERVAL ${day} DAY) BETWEEN`)})`).join(' OR ')})`;
}

/** Keep old pending work unchanged while every plan is stopped, including concurrent expiry batches. */
export function studentPlansRunningSql(studentColumn = null) {
  if (studentColumn && !/^[a-z_]+(?:\.[a-z_]+)?$/.test(studentColumn)) throw new Error('Invalid study student column');
  return `NOT EXISTS (SELECT 1 FROM app_settings pause_setting
    CROSS JOIN JSON_TABLE(IF(JSON_VALID(pause_setting.setting_value), pause_setting.setting_value, '{}'), '$.periods[*]'
      COLUMNS (end_date VARCHAR(10) PATH '$.endDate' NULL ON EMPTY)) pause_dates
    WHERE pause_setting.setting_key = 'studentPlanPause' AND pause_dates.end_date IS NULL)${studentColumn ? `
    AND NOT EXISTS (SELECT 1 FROM student_plan_pauses individual_pause
      CROSS JOIN JSON_TABLE(individual_pause.state_json, '$.periods[*]' COLUMNS (end_date VARCHAR(10) PATH '$.endDate' NULL ON EMPTY)) individual_dates
      WHERE individual_pause.student_id = ${studentColumn} AND individual_dates.end_date IS NULL)` : ''}`;
}
