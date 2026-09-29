import { compareQuranPositionInDirection as comparePlanPosition } from './quran-execution-policy.js';

const minPosition = (a, b, direction) => comparePlanPosition(a, b, direction) <= 0 ? a : b;
const maxPosition = (a, b, direction) => comparePlanPosition(a, b, direction) >= 0 ? a : b;

const invalidExecution = (message) => Object.assign(new Error(message), { statusCode: 422 });

export function classifyPlanExecution({
  actualStart,
  normalEnd,
  scheduledEnd,
  actualEnd,
  direction = 1,
  allowCompensation = true,
  allowExtra = false,
}) {
  if (!actualStart || !normalEnd || !actualEnd) return [];
  if (comparePlanPosition(actualEnd, actualStart, direction) < 0) {
    throw invalidExecution('نهاية التنفيذ تسبق بدايته.');
  }

  const delayed = scheduledEnd && comparePlanPosition(scheduledEnd, normalEnd, direction) > 0;
  if (!allowCompensation && delayed && comparePlanPosition(actualEnd, normalEnd, direction) > 0) {
    throw invalidExecution('التعويض غير مسموح لهذه الخطة.');
  }

  const extraBoundary = maxPosition(normalEnd, scheduledEnd || normalEnd, direction);
  if (!allowExtra && comparePlanPosition(actualEnd, delayed && allowCompensation ? scheduledEnd : normalEnd, direction) > 0) {
    throw invalidExecution('الزيادة خارج الخطة غير مسموحة.');
  }

  const segments = [];
  const normalActualEnd = minPosition(actualEnd, normalEnd, direction);
  segments.push({ type: 'normal', start: actualStart, end: normalActualEnd });

  if (allowCompensation && delayed && comparePlanPosition(actualEnd, normalEnd, direction) > 0) {
    segments.push({
      type: 'compensation',
      startAfter: normalEnd,
      end: minPosition(actualEnd, scheduledEnd, direction),
    });
  }

  if (allowExtra && comparePlanPosition(actualEnd, extraBoundary, direction) > 0) {
    segments.push({ type: 'extra', startAfter: extraBoundary, end: actualEnd });
  }

  return segments;
}
