import assert from 'node:assert/strict';
import test from 'node:test';
import { getDatesInRange } from '../server/services/dateRanges.js';
import { countScheduledPlanDays } from '../server/services/quranPlanProgress.js';

test('date ranges include both endpoints and cross leap days and years', () => {
  assert.deepEqual(getDatesInRange('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.deepEqual(getDatesInRange('2025-12-31', '2026-01-01'), ['2025-12-31', '2026-01-01']);
  assert.deepEqual(getDatesInRange('2026-09-22', '2026-09-22'), ['2026-09-22']);
  assert.deepEqual(getDatesInRange('2026-09-23', '2026-09-22'), []);
  assert.deepEqual(getDatesInRange('invalid', '2026-09-22'), []);
  assert.deepEqual(getDatesInRange('2026-09-22', 'invalid'), []);
});

test('scheduled day traversal is inclusive, respects weekdays and terminates on invalid ranges', () => {
  const range = { startDate: '2024-02-28', endDate: '2024-03-01' };
  assert.equal(countScheduledPlanDays({ ...range, scheduleDays: [0, 1, 2, 3, 4, 5, 6] }), 3);
  assert.equal(countScheduledPlanDays({ ...range, scheduleDays: [4] }), 1);
  assert.equal(countScheduledPlanDays({ ...range, scheduleDays: [] }), 0);
  assert.equal(countScheduledPlanDays({ startDate: '2026-09-23', endDate: '2026-09-22' }), 0);
  assert.equal(countScheduledPlanDays({ startDate: 'invalid', endDate: '2026-09-22' }), 0);
  assert.equal(countScheduledPlanDays({ startDate: '2026-09-22', endDate: 'invalid' }), 0);
});
