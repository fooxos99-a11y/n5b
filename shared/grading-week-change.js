import { gradingMaxima, gradingPolicyForDate, normalizeGradingPolicy } from './grading-policy.js';
import { shiftDateOnly } from './business-date.js';

const CORE_AMOUNTS = ['memorizationDaily', 'linkDaily', 'reviewDaily'];
const floor = value => Math.floor((value + Number.EPSILON) * 10000) / 10000;

/** Change only unrecorded dates. Session weights and past daily policies stay frozen. */
export function changeCurrentGradingWeek({ previous, desired, weekStart, today, lockedCore = false, lockedReading = false }) {
  const result = normalizeGradingPolicy(previous);
  const next = normalizeGradingPolicy(desired, { includeDayPolicies: false });
  result.weekStart = weekStart;
  result.dayPolicies = {};
  const editable = [];
  for (let day = 0; day < 7; day++) {
    const date = shiftDateOnly(weekStart, day);
    const policy = gradingPolicyForDate(previous, date);
    const core = date >= today && !(date === today && lockedCore);
    const reading = date >= today && !(date === today && lockedReading);
    if (core || reading) {
      const old = policy.weeklyProgram;
      policy.weeklyProgram = { ...next.weeklyProgram,
        ...(!core ? { workDays: old.workDays, attendance: old.attendance,
          ...Object.fromEntries(CORE_AMOUNTS.map(key => [key, old[key]])),
          mistakeDeduction: old.mistakeDeduction, warningDeduction: old.warningDeduction,
          hesitationDeduction: old.hesitationDeduction, linkFailThreshold: old.linkFailThreshold,
          hizbDeductionLimit: old.hizbDeductionLimit, memorizationThresholds: old.memorizationThresholds } : {}),
        ...(!reading ? { readingDays: old.readingDays, readingDaily: old.readingDaily } : {}),
      };
    }
    result.dayPolicies[date] = policy;
    editable.push({ day, policy, core, reading });
  }
  // Margins have no recorded daily result. Spend them before reducing unrecorded daily amounts.
  result.weeklyProgram.margin = next.weeklyProgram.margin;
  result.generalMargin = next.generalMargin;
  for (const [source, key] of [[result, 'generalMargin'], [result.weeklyProgram, 'margin']]) {
    const excess = gradingMaxima(result).total - 100;
    if (excess > 0) source[key] = floor(Math.max(0, source[key] - excess));
  }
  const total = gradingMaxima(result).total;
  if (total > 100) {
    const adjustable = editable.reduce((sum, { day, policy: { weeklyProgram: p }, core, reading }) => sum
      + (core && p.workDays.includes(day) ? p.attendance.present + CORE_AMOUNTS.reduce((s, key) => s + p[key], 0) : 0)
      + (reading && p.readingDays.includes(day) ? p.readingDaily : 0), 0);
    const available = 100 - (total - adjustable);
    if (available < -0.0001 || (adjustable === 0 && total > 100)) {
      throw Object.assign(new Error('لا يمكن تطبيق التعديل اليوم مع الحفاظ على الدرجات المسجلة. اختر الأسبوع القادم.'), { status: 422 });
    }
    const factor = Math.max(0, Math.min(1, available / adjustable));
    for (const { policy: { weeklyProgram: p }, core, reading } of editable) {
      if (core) {
        p.attendance = Object.fromEntries(Object.entries(p.attendance).map(([key, value]) => [key, floor(value * factor)]));
        for (const key of CORE_AMOUNTS) p[key] = floor(p[key] * factor);
      }
      if (reading) p.readingDaily = floor(p.readingDaily * factor);
    }
  }
  return result;
}
