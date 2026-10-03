/** How editing an active plan is saved. */
export const PLAN_SAVE_MODES = Object.freeze({
  /** Keep the running plan and its progress; only the amounts or range change. */
  continue: 'continue',
  /** Keep the current plan as history and start a fresh plan. */
  new: 'new',
});

/** Daily self-reading amount (faces) proposed for a new plan. */
export const DEFAULT_PLAN_READING_FACES = 10;
export const MAX_PLAN_READING_FACES = 604;

export const DEFAULT_PLAN_READING_HIZBS = 1;
export const MAX_PLAN_READING_HIZBS = 60;
export function validatePlanReadingHizbs(value) {
  if (value === undefined || value === null) return null; // Legacy face-based plan.
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_PLAN_READING_HIZBS) {
    throw Object.assign(new Error('مقدار القراءة اليومية يجب أن يكون من حزب إلى 60 حزبًا.'), { status: 422, statusCode: 422 });
  }
  return count;
}
