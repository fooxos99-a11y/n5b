import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceGradingPolicy } from '../src/lib/balanceGradingPolicy.js';
import { gradingMaxima, gradingPolicyErrors, normalizeGradingPolicy } from '../shared/grading-policy.js';

test('does not increase a total below 100 or mutate the supplied policy', () => {
  const policy = normalizeGradingPolicy({ generalMargin: 10 });
  const original = structuredClone(policy);
  const balanced = balanceGradingPolicy(policy);
  assert.deepEqual(policy, original);
  assert.deepEqual(balanced, policy);
  assert.equal(gradingMaxima(balanced).total, 90);
});

test('automatically spends the margin before changing any grade amounts', () => {
  const policy = normalizeGradingPolicy({ weeklyProgram: { readingDaily: 2 } });
  const balanced = balanceGradingPolicy(policy);
  assert.equal(balanced.generalMargin, 13);
  assert.deepEqual(balanced.weeklyProgram, policy.weeklyProgram);
  assert.deepEqual(balanced.trackSession, policy.trackSession);
  assert.equal(gradingMaxima(balanced).total, 100);
});

test('proportionally reduces amounts and absolute penalties after exhausting the margin', () => {
  const policy = normalizeGradingPolicy({ weeklyProgram: { memorizationDaily: 20 }, trackSession: { segments: [{ source: 'review', max: 13 }, { source: 'link', max: 7 }] } });
  const original = structuredClone(policy);
  const factor = 100 / (gradingMaxima(policy).total - policy.generalMargin);
  const balanced = balanceGradingPolicy(policy);
  for (const [before, after] of [
    [policy.weeklyProgram.memorizationDaily, balanced.weeklyProgram.memorizationDaily],
    [policy.weeklyProgram.attendance.late, balanced.weeklyProgram.attendance.late],
    [policy.trackSession.attendance, balanced.trackSession.attendance],
    [policy.trackSession.mistakeDeduction, balanced.trackSession.mistakeDeduction],
    [policy.trackSession.segments[0].max, balanced.trackSession.segments[0].max],
    [policy.weeklySession.attendanceLate, balanced.weeklySession.attendanceLate],
  ]) assert.ok(Math.abs(after - before * factor) < 0.00011);
  assert.equal(gradingMaxima(balanced).total, 100);
  assert.ok(balanced.generalMargin < .01);
  assert.equal(balanced.weeklyProgram.mistakeDeduction, policy.weeklyProgram.mistakeDeduction);
  assert.deepEqual(balanced.weeklyProgram.memorizationThresholds, policy.weeklyProgram.memorizationThresholds);
  assert.deepEqual(balanced.weeklyProgram.workDays, policy.weeklyProgram.workDays);
  assert.deepEqual(balanced.statistics, policy.statistics);
  assert.deepEqual(gradingPolicyErrors(balanced), {});
  assert.deepEqual(balanceGradingPolicy(balanced), balanced);
  assert.deepEqual(policy, original);
});

test('rounding stays within 100 for legacy segments and every valid workday count', () => {
  for (let dayCount = 1; dayCount <= 7; dayCount += 1) {
    for (const amount of [.3333, 3, 33.3333, 1000]) {
      const balanced = balanceGradingPolicy({ weeklyProgram: { workDays: Array.from({ length: dayCount }, (_, i) => i), readingDaily: amount }, trackSession: { segmentCount: 20, segmentMax: amount } });
      assert.ok(gradingMaxima(balanced).total <= 100);
      assert.deepEqual(gradingPolicyErrors(balanced), {});
      assert.deepEqual(balanceGradingPolicy(balanced), balanced);
    }
  }
});
