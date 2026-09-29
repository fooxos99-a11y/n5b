import assert from 'node:assert/strict';
import test from 'node:test';
import { requestNativeNotificationPermission } from '../src/lib/nativeNotificationPermission.js';

test('first native entry requests permission once even when multiple consumers mount', async () => {
  let count = 0;
  let resolve;
  const push = {
    checkPermissions: async () => ({ receive: 'prompt' }),
    requestPermissions: () => { count++; return new Promise((done) => { resolve = done; }); },
  };
  const requests = [requestNativeNotificationPermission(push), requestNativeNotificationPermission(push)];
  await Promise.resolve();
  assert.equal(count, 1);
  resolve({ receive: 'granted' });
  assert.deepEqual(await Promise.all(requests), [{ receive: 'granted' }, { receive: 'granted' }]);
});

test('native permission respects a previous denial or grant without prompting again', async () => {
  for (const receive of ['denied', 'granted']) {
    const permission = await requestNativeNotificationPermission({
      checkPermissions: async () => ({ receive }),
      requestPermissions: () => { throw new Error('Unexpected prompt'); },
    });
    assert.equal(permission.receive, receive);
  }
});
