import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configuredRegistrationEntry, registrationEntryFromUrl } from '../src/domain/nativeNavigation';

test('registration accepts current root and native entries with opaque tenant keys', () => {
  for (const url of ['nukhab://register?registrationNumber=test-1', 'nukhab:///?registration=1&registrationNumber=test-1', 'https://example.test/?registration=1&registrationNumber=test-1', 'https://example.test/register?registrationNumber=test-1']) {
    assert.deepEqual(registrationEntryFromUrl(url, 'https://example.test/api'), { registrationNumber: 'test-1' });
  }
});
test('links cannot inject another host, a tenant URL or an authenticated destination', () => {
  for (const url of [null, '', 'not-a-url', 'https://other.test/register?registrationNumber=x', 'nukhab://dashboard?role=manager', 'nukhab://register', 'nukhab://register?registrationNumber=https://other.test', 'nukhab://register?registrationNumber=../../x']) {
    assert.equal(registrationEntryFromUrl(url, 'https://example.test/api'), null);
  }
  assert.equal(configuredRegistrationEntry(' '), null);
  assert.equal(configuredRegistrationEntry('a'.repeat(33)), null);
});
