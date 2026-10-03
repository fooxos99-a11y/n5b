export const SEASONAL_HOLIDAYS_KEY = 'seasonalHolidays';
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function normalizeSeasonalHolidays(value = []) {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { throw Object.assign(new Error('الإجازات الموسمية غير صحيحة.'), { status: 422 }); }
  }
  if (!Array.isArray(value) || value.length > 100) throw Object.assign(new Error('يمكن إضافة حتى 100 إجازة موسمية.'), { status: 422 });
  return value.map(item => {
    if (!validDate(item?.startDate) || !validDate(item?.endDate) || item.startDate > item.endDate) {
      throw Object.assign(new Error('حدد بداية الإجازة ونهايتها بترتيب صحيح.'), { status: 422 });
    }
    return { startDate: item.startDate, endDate: item.endDate };
  }).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export const isSeasonalHoliday = (date, holidays = []) => holidays.some(item => date >= item.startDate && date <= item.endDate);
