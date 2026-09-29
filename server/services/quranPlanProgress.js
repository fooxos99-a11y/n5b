import { UTC_DAY_MS } from './dateRanges.js';

const toUtcDate = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12));
};

export const comparePlanPosition = compareQuranPositionInDirection;

export function countScheduledPlanDays({ startDate, endDate, scheduleDays = [0, 1, 2, 3, 4] }) {
  const start = toUtcDate(startDate);
  const end = toUtcDate(endDate);
  if (!start || !end || start > end) return 0;
  const allowed = new Set((Array.isArray(scheduleDays) ? scheduleDays : []).map(Number));
  let count = 0;
  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += UTC_DAY_MS) {
    if (allowed.has(new Date(cursor).getUTCDay())) count += 1;
  }
  return count;
}

export function calculateWeeklyReviewDailyPages({
  availableReviewPages,
  reviewDays,
  minimumDailyPages = 1,
}) {
  const available = Math.max(0, Math.trunc(Number(availableReviewPages || 0)));
  if (!available) return 0;
  const days = Math.max(1, Math.trunc(Number(reviewDays || 0)));
  const minimum = Math.max(1, Math.trunc(Number(minimumDailyPages || 1)));
  return Math.min(available, Math.max(Math.ceil(available / days), minimum));
}

const maxPosition = (first, second, direction) => (
  comparePlanPosition(first, second, direction) >= 0 ? first : second
);

export function getPlanExecutionLimit({
  normalEnd,
  scheduledEnd,
  extraEnd,
  direction = 1,
  allowCompensation = true,
  allowExtra = false,
}) {
  if (!normalEnd) return null;
  const delayed = scheduledEnd && comparePlanPosition(scheduledEnd, normalEnd, direction) > 0;
  if (allowExtra && (!delayed || allowCompensation)) return extraEnd || maxPosition(normalEnd, scheduledEnd || normalEnd, direction);
  if (allowCompensation && delayed) return scheduledEnd;
  return normalEnd;
}

export { classifyPlanExecution } from '../../shared/quran-plan-execution.js';

import { compareQuranPositionInDirection } from '../../shared/quran-execution-policy.js';
