import test from 'node:test';
import assert from 'node:assert/strict';
import { getStartupTiming } from '../src/lib/startupTiming.js';

test('startup overlaps loading and retains only the card transition after a slow load', () => {
  assert.deepEqual(getStartupTiming({ active: true, startedAt: 100, now: 600 }), { elapsed: 500, duration: 1500 });
  assert.deepEqual(getStartupTiming({ active: true, now: 5000 }), { elapsed: 1200, duration: 800 });
});
test('finished startup and reduced motion never impose an animation wait', () => {
  assert.equal(getStartupTiming({ active: false, now: 500 }).duration, 0);
  assert.equal(getStartupTiming({ active: true, now: 500, reducedMotion: true }).duration, 0);
});
