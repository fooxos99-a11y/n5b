import assert from 'node:assert/strict';
import test from 'node:test';
import { performanceChartData } from '../src/components/dashboard/reports/performanceChartData.js';

test('each cumulative requirement is measured against its own expected faces', () => {
  const { points, keys } = performanceChartData([{ date: '2026-10-06', expected: 12, done: 7, percentage: 58.3,
    components: { memorization: { expected: 2, done: 2 }, review: { expected: 10, done: 5 } } }]);
  assert.deepEqual(keys, ['memorization', 'review']);
  assert.equal(points[0].memorization, 100);
  assert.equal(points[0].review, 50);
  assert.equal(points[0].reading, null);
});

test('no due amount is a gap, while a missed due requirement is zero and advance is not clamped', () => {
  const { points, upper, ticks } = performanceChartData([
    { expected: 2, percentage: 0, components: { memorization: { expected: 2, done: 0 }, reading: { expected: 0, done: 1 } } },
    { expected: 4, percentage: 175, components: { memorization: { expected: 4, done: 7 }, reading: { expected: 2, done: 2 } } },
  ]);
  assert.equal(points[0].memorization, 0);
  assert.equal(points[0].reading, null);
  assert.equal(points[1].memorization, 175);
  assert.equal(upper, 200);
  assert.deepEqual(ticks, [1, 50, 100, 150, 200]);
});

test('historical reports without components keep their overall line, empty reports stay empty', () => {
  const { points, keys } = performanceChartData([{ expected: 0, percentage: null }, { expected: 2, done: 1, percentage: 50 }]);
  assert.equal(points.length, 1);
  assert.deepEqual(keys, ['percentage']);
  assert.equal(points[0].percentage, 50);
  assert.equal(performanceChartData([]).points.length, 0);
});
