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
