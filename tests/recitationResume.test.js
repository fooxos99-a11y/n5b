import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeRecitationResume } from '../src/lib/recitationResume.js';

test('mobile resume and reconnect reload a stale recitation session without requiring focus', () => {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'hidden';
  let online = true;
  let calls = 0;
  const stop = subscribeRecitationResume({ windowTarget, documentTarget,
    isOnline: () => online, refresh: () => { calls += 1; } });
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 0);
  documentTarget.visibilityState = 'visible';
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1);
  online = false;
  windowTarget.dispatchEvent(new Event('focus'));
  assert.equal(calls, 1);
  online = true;
  windowTarget.dispatchEvent(new Event('online'));
  assert.equal(calls, 2);
  stop();
  windowTarget.dispatchEvent(new Event('focus'));
  windowTarget.dispatchEvent(new Event('online'));
  documentTarget.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 2);
});
