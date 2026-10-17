import test from 'node:test';
import assert from 'node:assert/strict';
import { versionIsOlder } from '../shared/native-update.js';
import { createNativeUpdatePolicy, nativeUpdatePolicy } from '../server/services/nativeUpdate.js';

test('native update compares numeric versions without blocking the current version', () => {
  assert.equal(versionIsOlder('1.0.9', '1.0.20'), true);
  assert.equal(versionIsOlder('1.0.20', '1.0.20'), false);
  assert.equal(versionIsOlder('1.0.23', '1.0.20'), false);
  assert.equal(versionIsOlder('', '1.0.20'), false);
});
test('native updates only recognize configured apps and supported platforms', async () => {
  assert.deepEqual(await nativeUpdatePolicy('unknown', 'android'), { available: false });
  assert.deepEqual(await nativeUpdatePolicy('sa.nukhab.app', 'web'), { available: false });
  assert.deepEqual(await nativeUpdatePolicy('sa.nukhab.app', 'android'), { available: false });
});
const storeItem = version => ({ bundleId: 'sa.nukhab.app', trackId: 123456789, version });
const response = items => ({ ok: true, json: async () => ({ results: items }) });
const configuredPolicy = request => createNativeUpdatePolicy({ storeId: () => '123456789', request });

test('each publicly downloadable iOS version becomes mandatory only for older clients', async () => {
  const policy = configuredPolicy(async () => response([storeItem('1.0.20')]));
  const update = await policy('sa.nukhab.app', 'ios');
  assert.deepEqual(update, { available: true, minimumVersion: '1.0.20', url: 'https://apps.apple.com/sa/app/id123456789' });
  assert.equal(versionIsOlder('1.0.19', update.minimumVersion), true);
  assert.equal(versionIsOlder('1.0.20', update.minimumVersion), false);
  assert.equal(versionIsOlder('1.0.21', update.minimumVersion), false);
});

test('unpublished apps, mismatched identities and malformed versions never force an update', async () => {
  for (const items of [[], [{ ...storeItem('1.0.20'), bundleId: 'other.app' }], [{ ...storeItem('1.0.20'), trackId: 999999999 }], [storeItem('latest')]]) {
    assert.deepEqual(await configuredPolicy(async () => response(items))('sa.nukhab.app', 'ios'), { available: false });
  }
});

test('App Store failures cannot block offline users or require an unavailable release', async () => {
  for (const request of [async () => ({ ok: false }), async () => { throw new Error('offline'); }]) {
    assert.deepEqual(await configuredPolicy(request)('sa.nukhab.app', 'ios'), { available: false });
  }
});

test('missing configuration and unsupported targets make no store request', async () => {
  const policy = createNativeUpdatePolicy({ storeId: () => '', request: async () => { assert.fail('No request expected'); } });
  assert.deepEqual(await policy('sa.nukhab.app', 'ios'), { available: false });
  const configured = configuredPolicy(async () => { assert.fail('No request expected'); });
  assert.deepEqual(await configured('sa.nukhab.app.preview', 'ios'), { available: false });
  assert.deepEqual(await configured('sa.nukhab.app', 'android'), { available: false });
});

test('store checks are deduplicated and refresh automatically after a new publication', async () => {
  let time = 0, calls = 0;
  const policy = createNativeUpdatePolicy({ storeId: () => '123456789', now: () => time, request: async () => response([storeItem(++calls === 1 ? '1.0.20' : '1.0.21')]) });
  const first = await Promise.all([policy('sa.nukhab.app', 'ios'), policy('sa.nukhab.app', 'ios')]);
  assert.equal(calls, 1);
  assert.equal(first[0].minimumVersion, '1.0.20');
  time = 300001;
  assert.equal((await policy('sa.nukhab.app', 'ios')).minimumVersion, '1.0.21');
  assert.equal(calls, 2);
});
