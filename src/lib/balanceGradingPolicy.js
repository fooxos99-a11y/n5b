import { gradingMaxima, normalizeGradingPolicy } from '../../shared/grading-policy.js';

/** Spend the general margin first, then preserve the relative weights of all grade amounts. */
export function balanceGradingPolicy(rawPolicy) {
  const policy = normalizeGradingPolicy(rawPolicy);
  const { total, generalMargin } = gradingMaxima(policy);
  if (total <= 100) return policy;

  policy.generalMargin = Number(Math.max(0, generalMargin - (total - 100)).toFixed(4));
  const remainingTotal = gradingMaxima(policy).total;
  if (remainingTotal <= 100) return policy;

  const factor = 100 / remainingTotal;
  const scale = (value) => Math.floor((value * factor + Number.EPSILON) * 10000) / 10000;
  const program = policy.weeklyProgram;
  program.attendance = Object.fromEntries(Object.entries(program.attendance).map(([status, value]) => [status, scale(value)]));
  for (const key of ['memorizationDaily', 'linkDaily', 'reviewDaily', 'readingDaily', 'margin']) program[key] = scale(program[key]);
  for (const key of ['attendance', 'attendanceLate', 'attendanceExcused', 'attendanceAbsent']) {
    policy.trackSession[key] = scale(policy.trackSession[key]);
    policy.weeklySession[key] = scale(policy.weeklySession[key]);
  }
  for (const key of ['segmentMax', 'mistakeDeduction', 'warningDeduction', 'hesitationDeduction']) {
    policy.trackSession[key] = scale(policy.trackSession[key]);
  }
  if (policy.trackSession.segments) {
    policy.trackSession.segments = policy.trackSession.segments.map((segment) => ({ ...segment, max: scale(segment.max) }));
  }
  // Put only the sub-cent rounding remainder in the margin so the persisted total stays exactly 100.
  policy.generalMargin = Number((100 - gradingMaxima(policy).total).toFixed(4));
  return policy;
}
