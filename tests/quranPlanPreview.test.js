import assert from 'node:assert/strict';
import test from 'node:test';
import { countExpectedMemorizationDays } from '../src/lib/quranPlanPreview.js';

test('expected plan duration counts memorization days only', () => {
  assert.equal(countExpectedMemorizationDays({ pages: 10, dailyPages: 1 }), 10);
  assert.equal(countExpectedMemorizationDays({ pages: 10, dailyPages: 2 }), 5);
  assert.equal(countExpectedMemorizationDays({ pages: 2.5, dailyPages: 0.5 }), 5);
  assert.equal(countExpectedMemorizationDays({ pages: 1, dailyPages: 0.25 }), 4);
  assert.equal(countExpectedMemorizationDays({ pages: 0, dailyPages: 1 }), 0);
});
