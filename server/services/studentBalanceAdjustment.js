import { roundPoints } from './studentPoints.js';

const ADJUSTMENT_TYPES = new Set(['increase', 'deduction']);
const MAX_ADJUSTMENT = 2147483647;

function invalid(message, statusCode = 422) {
  return Object.assign(new Error(message), { statusCode });
}

const formatGrades = (value) => roundPoints(value).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 2 });

/**
 * Reads the «إضافة / خصم» change of the student's main grade balance.
 * Returns null when no amount was entered; the final balance is never sent directly.
 */
export function normalizeStudentGradeAdjustment({ type, amount, reason } = {}) {
  const text = String(amount ?? '').trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > MAX_ADJUSTMENT) throw invalid('أدخل عدد درجات صحيحًا بدون سالب.');
  const grades = roundPoints(value);
  if (!grades) return null;
  if (!ADJUSTMENT_TYPES.has(type)) throw invalid('اختر إضافة أو خصم.');
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw invalid('سبب تعديل الرصيد مطلوب.');
  if (cleanReason.length > 500) throw invalid('سبب تعديل الرصيد أطول من الحد المسموح.');
  return { type, grades, delta: type === 'increase' ? grades : -grades, reason: cleanReason };
}

/** The balance can never go below zero, so a larger deduction is refused instead of being cut. */
export function assertGradeAdjustmentAllowed(currentBalance, adjustment) {
  if (!adjustment) return roundPoints(currentBalance);
  const next = roundPoints(Number(currentBalance || 0) + adjustment.delta);
  if (next < 0) throw invalid(`لا يمكن خصم أكثر من الرصيد الحالي (${formatGrades(currentBalance)} درجة).`);
  if (next > MAX_ADJUSTMENT) throw invalid('الرصيد بعد الإضافة أكبر من الحد المسموح.');
  return next;
}
