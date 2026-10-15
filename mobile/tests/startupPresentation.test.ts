import assert from 'node:assert/strict';
import test from 'node:test';
import { startStartupPresentation, STARTUP_COMPLETION_BUDGET_MS } from '../src/components/startupPresentation';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function deferredMotion() {
  let resolve: (value: boolean) => void = () => assert.fail('Motion promise was not initialized');
  const promise = new Promise<boolean>(done => { resolve = done; });
  return { promise, resolve };
}

test('normal startup retains the animation and completes once before its fallback budget', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let completed = 0; let started = 0; let stopped = 0;
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: async () => false, onComplete: () => completed++,
    animate: onEnd => {
      started++;
      const timer = setTimeout(() => onEnd({ finished: true }), 2000);
      return { stop: () => { stopped++; clearTimeout(timer); } };
    } });
  await flush();
  assert.equal(started, 1); assert.equal(completed, 0);
  context.mock.timers.tick(1999); assert.equal(completed, 0);
  context.mock.timers.tick(1); assert.equal(completed, 1); assert.equal(stopped, 1);
  context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS); assert.equal(completed, 1);
  cleanup();
});

test('reduced motion bypasses the animation and clears the fallback completion', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); let completed = 0;
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: async () => true,
    animate: () => assert.fail('Reduced motion must not animate'), onComplete: () => completed++ });
  await flush(); assert.equal(completed, 1);
  context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS * 2); assert.equal(completed, 1);
  cleanup();
});

test('a hung accessibility promise completes at the budget and cannot start a late animation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); const motion = deferredMotion(); let completed = 0;
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: () => motion.promise,
    animate: () => assert.fail('Expired startup must not animate'), onComplete: () => completed++ });
  context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS - 1); assert.equal(completed, 0);
  context.mock.timers.tick(1); assert.equal(completed, 1);
  motion.resolve(false); await flush(); assert.equal(completed, 1);
  context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS); assert.equal(completed, 1);
  cleanup();
});

test('accessibility rejection completes without starting an animation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); let completed = 0;
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: async () => { throw new Error('Native accessibility unavailable'); },
    animate: () => assert.fail('Rejected motion lookup must not animate'), onComplete: () => completed++ });
  await flush(); assert.equal(completed, 1);
  context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS); assert.equal(completed, 1);
  cleanup();
});

test('an interrupted animation completes while mounted and repeated native callbacks stay harmless', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); let completed = 0;
  let end: (result: { finished: boolean }) => void = () => assert.fail('Animation has not started');
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: async () => false, onComplete: () => completed++,
    animate: onEnd => { end = onEnd; return { stop: () => onEnd({ finished: false }) }; } });
  await flush();
  // RN reports both successful completion and interruption through this callback.
  end({ finished: false }); end({ finished: true }); assert.equal(completed, 1);
  context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS); assert.equal(completed, 1);
  cleanup(); assert.equal(completed, 1);
});

test('a missing animation callback still completes and stops the animation at the budget', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); let completed = 0; let stopped = 0;
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: async () => false,
    animate: () => ({ stop: () => { stopped++; } }), onComplete: () => completed++ });
  await flush(); context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS);
  assert.equal(completed, 1); assert.equal(stopped, 1); cleanup();
});

test('unmount during the accessibility lookup cancels its budget and all later work', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); const motion = deferredMotion(); let completed = 0;
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: () => motion.promise,
    animate: () => assert.fail('Unmounted startup must not animate'), onComplete: () => completed++ });
  cleanup(); context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS * 2);
  motion.resolve(false); await flush(); assert.equal(completed, 0);
});

test('unmount during an animation suppresses its stop callback and any late completion', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); let completed = 0; let stopped = 0;
  let end: (result: { finished: boolean }) => void = () => assert.fail('Animation has not started');
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: async () => false, onComplete: () => completed++,
    animate: onEnd => { end = onEnd; return { stop: () => { stopped++; onEnd({ finished: false }); } }; } });
  await flush(); cleanup(); assert.equal(stopped, 1); assert.equal(completed, 0);
  end({ finished: true }); context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS * 2); assert.equal(completed, 0);
});

test('an animation start failure completes without waiting for the budget', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); let completed = 0;
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: async () => false,
    animate: () => { throw new Error('Animation unavailable'); }, onComplete: () => completed++ });
  await flush(); assert.equal(completed, 1);
  context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS); assert.equal(completed, 1); cleanup();
});

test('an animation stop error cannot suppress or repeat startup completion', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] }); let completed = 0;
  let end: (result: { finished: boolean }) => void = () => assert.fail('Animation has not started');
  const cleanup = startStartupPresentation({ isReduceMotionEnabled: async () => false, onComplete: () => completed++,
    animate: onEnd => { end = onEnd; return { stop: () => { throw new Error('Native stop failed'); } }; } });
  await flush();
  assert.throws(() => end({ finished: false }), /Native stop failed/);
  assert.equal(completed, 1);
  end({ finished: true }); cleanup(); context.mock.timers.tick(STARTUP_COMPLETION_BUDGET_MS);
  assert.equal(completed, 1);
});
