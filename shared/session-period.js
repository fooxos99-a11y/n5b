import { shiftDateOnly } from './business-date.js';

const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();
const sessionDayOf = value => Number.isInteger(value) && value >= 0 && value <= 6 ? value : 0;

/** Keep the existing Sunday storage key while the session runs from its configured day. */
export function sessionPeriod(weekStart, sessionDay) {
  const start = shiftDateOnly(weekStart, sessionDayOf(sessionDay));
  return { start, end: shiftDateOnly(start, 6) };
}

export function currentSessionWeek(today, sessionDay) {
  const day = sessionDayOf(sessionDay);
  const start = shiftDateOnly(today, -((weekday(today) - day + 7) % 7));
  return shiftDateOnly(start, -day);
}

/** Only a recorded session owns a historical day; daily grades must not freeze session timing. */
export function recordedSessionDay(currentDay, recordedPolicy, section) {
  return sessionDayOf(recordedPolicy ? recordedPolicy[section]?.sessionDay : currentDay);
}

export function assertSessionStarted(weekStart, sessionDay, today) {
  if (sessionPeriod(weekStart, sessionDay).start > today) {
    throw Object.assign(new Error('لا يمكن التسجيل لجلسة لم تبدأ بعد.'), { status: 422 });
  }
}
