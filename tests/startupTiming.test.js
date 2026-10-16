import test from 'node:test';
import assert from 'node:assert/strict';
import { getStartupTiming } from '../src/lib/startupTiming.js';

test('React joins the existing startup timeline without restarting it after a slow load', () => {
  assert.deepEqual(getStartupTiming({ active: true, startedAt: 100, now: 600 }), { elapsed: 500, duration: 1500 });
  assert.deepEqual(getStartupTiming({ active: true, startedAt: 0, now: 5000 }), { elapsed: 2000, duration: 0 });
  assert.deepEqual(getStartupTiming({ active: true, startedAt: 100, now: 50 }), { elapsed: 0, duration: 2000 });
});
test('finished startup and reduced motion never impose an animation wait', () => {
  assert.equal(getStartupTiming({ active: false, now: 500 }).duration, 0);
  assert.equal(getStartupTiming({ active: true, now: 500, reducedMotion: true }).duration, 0);
});
