import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeOptionalAccountNumber, normalizeOptionalPhone, normalizeOptionalIdentity } from '../shared/account-contact.js';

test('identity and phone accept empty or non-ten-digit values for every account type', async () => {
  assert.equal(normalizeOptionalAccountNumber(''), '');
  assert.equal(normalizeOptionalAccountNumber('123'), '123');
  assert.equal(normalizeOptionalAccountNumber('٠٥ ١٢٣'), '05123');
  assert.throws(() => normalizeOptionalAccountNumber('1'.repeat(41)), /40/);

  const [server, registration, students, requests] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PublicRegistration.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/RegistrationRequestsSection.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(server, /رقم (?:الجوال|الهوية) يجب أن يكون 10 أرقام/);
  assert.doesNotMatch(registration, /maxLength=\{10\}|guardianPhone[^\n]+required|nationalId[^\n]+required/);
  assert.doesNotMatch(requests, /acceptForm\.(?:guardianPhone|nationalId)\.trim\(\)/);
  assert.doesNotMatch(students, /!String\(student\.(?:guardianPhone|nationalId)\)\.trim\(\)/);
});


test('account input rejects letters and incomplete identities instead of silently stripping them', () => {
  assert.equal(normalizeOptionalPhone('+966 50 123 4567'), '966501234567');
  assert.equal(normalizeOptionalIdentity('١٠٠٠٠٠٠٠٠١'), '1000000001');
  assert.equal(normalizeOptionalPhone(''), '');
  assert.equal(normalizeOptionalIdentity(''), '');
  for (const value of ['abc1', '123']) assert.throws(() => normalizeOptionalPhone(value));
  for (const value of ['12', 'abc1000000001']) assert.throws(() => normalizeOptionalIdentity(value));
});
