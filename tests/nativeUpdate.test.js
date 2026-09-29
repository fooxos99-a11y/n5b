import test from 'node:test';
import assert from 'node:assert/strict';
import { versionIsOlder } from '../shared/native-update.js';
import { nativeUpdatePolicy } from '../server/services/nativeUpdate.js';

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
test('iOS mandatory update waits for the public App Store version', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: [{ bundleId: 'sa.nukhab.app', version: '1.0.12' }] }) });
  try { assert.equal((await nativeUpdatePolicy('sa.nukhab.app', 'ios')).available, false); }
  finally { globalThis.fetch = original; }
});
