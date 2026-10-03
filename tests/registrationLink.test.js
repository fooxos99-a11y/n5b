import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRegistrationLink, isRegistrationEntry, normalizeSiteRegistrationNumber } from '../shared/registration-link.js';

test('registration links retain the current web host, installation path and tenant', () => {
  const link = new URL(buildRegistrationLink({ origin: 'https://example.test', basePath: '/nukhba/', publicUrl: 'https://canonical.test/', registrationNumber: ' 1234 ' }));
  assert.equal(link.origin, 'https://example.test');
  assert.equal(link.pathname, '/nukhba/');
  assert.equal(link.searchParams.get('registrationNumber'), '1234');
  assert.equal(isRegistrationEntry(link.search), true);
});

test('site configuration accepts tenant keys and rejects request syntax', () => {
  for (const key of ['1483', 'owner', 'tenant_1', 'tenant-1']) {
    assert.equal(normalizeSiteRegistrationNumber(` ${key} `), key);
  }
  for (const key of [null, undefined, {}, '', 'https://evil.test', '//evil.test', '../admin', '1483&admin=1', '1483\r\nX-Admin: true', 'a'.repeat(33)]) {
    assert.equal(normalizeSiteRegistrationNumber(key), '');
  }
});

test('native registration links use the public website and standalone links omit a tenant', () => {
  const link = new URL(buildRegistrationLink({ origin: 'capacitor://localhost', native: true, publicUrl: 'https://canonical.test/app/?old=1#stale' }));
  assert.equal(link.origin, 'https://canonical.test');
  assert.equal(link.pathname, '/app/');
  assert.equal(link.searchParams.has('registrationNumber'), false);
  assert.equal(link.searchParams.has('old'), false);
  assert.equal(link.hash, '');
  assert.equal(isRegistrationEntry('?registrationNumber=1234'), false);
  assert.equal(isRegistrationEntry('?registration=0'), false);
});
