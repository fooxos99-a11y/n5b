import assert from 'node:assert/strict';
import test from 'node:test';
import { validCallGrant } from '../src/domain/callGrant';

test('call requires a nonempty token and a secure or loopback WebSocket URL', () => {
  assert.equal(validCallGrant(null), false);
  assert.equal(validCallGrant({ token: '', serverUrl: 'wss://fixture.invalid' }), false);
  assert.equal(validCallGrant({ token: 'test-only-token', serverUrl: 'https://fixture.invalid' }), false);
  assert.equal(validCallGrant({ token: 'test-only-token', serverUrl: 'ws://fixture.invalid' }), false);
  assert.equal(validCallGrant({ token: 'test-only-token', serverUrl: 'wss://fixture.invalid' }), true);
  assert.equal(validCallGrant({ token: 'test-only-token', serverUrl: 'ws://127.0.0.1:7880' }), true);
});
