import { assertStudyDate, loadSeasonalHolidays } from './seasonalHolidays.js';
import { isSeasonalHoliday } from '../../shared/seasonal-holidays.js';
import { getBusinessDate } from '../../shared/business-date.js';

/** A recorded result belongs to an existing student and the current, unreset term. */
export async function assertGradeDate(connection, studentId, date, { weekly = false, today = getBusinessDate(), periodStart = date } = {}) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid || date > today) throw Object.assign(new Error('تاريخ الرصد غير صحيح.'), { status: 422 });
  if (!weekly) await assertStudyDate(connection, date);
  else {
    const holidays = await loadSeasonalHolidays(connection);
    if (Array.from({length:7}, (_, index) => new Date(Date.parse(`${periodStart}T00:00:00Z`) + index * 86400000).toISOString().slice(0,10)).every(day => isSeasonalHoliday(day, holidays))) {
      throw Object.assign(new Error('لا توجد جلسة مطلوبة خلال الإجازة الموسمية.'), {status:422});
    }
  }
  const [[row]] = await connection.query(`SELECT DATE_FORMAT(s.created_at, '%Y-%m-%d') AS joined,
    (SELECT setting_value FROM app_settings WHERE setting_key = 'currentTermStartDate') AS termStart,
    (SELECT setting_value FROM app_settings WHERE setting_key = 'gradePointsResetDate') AS resetDate
    FROM students s WHERE s.id = ?`, [studentId]);
  if (!row) throw Object.assign(new Error('الطالب غير موجود.'), { status: 404 });
  const end = weekly ? new Date(Date.parse(`${periodStart}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10) : date;
  if ((row.joined && end < row.joined) || (row.termStart && end < row.termStart) || (row.resetDate && end < row.resetDate)) {
    throw Object.assign(new Error('لا يمكن رصد درجات قبل تسجيل الطالب أو في فصل مغلق أو فترة صُفّرت نقاطها.'), { status: 422 });
  }
}
