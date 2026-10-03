import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleCompensationDays } from '../server/services/compensationEligibility.js';
import { normalizeGradingPolicy, gradingPolicyErrors } from '../shared/grading-policy.js';

const options = { firstPlanDate: '2026-09-06', today: '2026-10-04', sessionDay: 0, scope: 'program',
  candidates: ['2026-08-30', '2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-09-28', '2026-10-04', '2026-10-11'],
  compensatedPeriods: new Set(['2026-09-20']), holidays: [{ startDate: '2026-09-27', endDate: '2026-09-27' }],
  policyForDate: () => normalizeGradingPolicy() };

test('pending compensation starts with first plan and excludes holidays, wrong weekdays, future and credited days', () => {
  assert.deepEqual(eligibleCompensationDays(options), [
    { date: '2026-09-06', dayNumber: 1 }, { date: '2026-09-13', dayNumber: 8 }, { date: '2026-10-04', dayNumber: 29 },
  ]);
  assert.deepEqual(eligibleCompensationDays({ ...options, firstPlanDate: null }), []);
  assert.deepEqual(eligibleCompensationDays({ ...options, sessionDay: null }), []);
  assert.deepEqual(eligibleCompensationDays({ ...options, lowerBound: '2026-10-01' }), [{ date: '2026-10-04', dayNumber: 29 }]);
});

test('track compensation excludes its credited week and sessions without achievement', () => {
  assert.deepEqual(eligibleCompensationDays({ ...options, scope: 'track', sessionDay: 1,
    candidates: ['2026-09-21', '2026-09-28'], holidays: [] }), [{ date: '2026-09-28', dayNumber: 23 }]);
  assert.deepEqual(eligibleCompensationDays({ ...options, scope: 'track', policyForDate: () => normalizeGradingPolicy({ trackSession: { segments: [] } }) }), []);
});

test('session weekdays are independent persisted policy values with strict validation', () => {
  const policy = normalizeGradingPolicy({ trackSession: { sessionDay: 0 }, weeklySession: { sessionDay: 6 } });
  assert.equal(policy.trackSession.sessionDay, 0);
  assert.equal(policy.weeklySession.sessionDay, 6);
  assert.equal(normalizeGradingPolicy().trackSession.sessionDay, null);
  for (const section of ['trackSession', 'weeklySession']) {
    for (const day of [-1, 7, 1.5, 'invalid', '']) assert.ok(gradingPolicyErrors({ [section]: { sessionDay: day } })[`${section}.sessionDay`]);
    assert.equal(gradingPolicyErrors({ [section]: { sessionDay: 0 } })[`${section}.sessionDay`], undefined);
  }
});
