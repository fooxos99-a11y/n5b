import test from 'node:test';
import assert from 'node:assert/strict';
import { hashStudentPassword, validateStudentPassword, verifyStudentPassword } from '../server/services/studentPassword.js';

test('student passwords accept short and arbitrary text and use unique salted hashes', async () => {
  for (const password of ['12', 'x', 'كلمة مرور ١٢', ' 12 ']) {
    const hash = await hashStudentPassword(password);
    assert.notEqual(hash, password);
    assert.equal(await verifyStudentPassword(password, hash), true);
    assert.equal(await verifyStudentPassword(`${password}x`, hash), false);
    assert.equal(await verifyStudentPassword('', hash), false);
  }
  assert.notEqual(await hashStudentPassword('12'), await hashStudentPassword('12'));
});

test('missing, invalid and oversized passwords are rejected without coercion', async () => {
  for (const password of [undefined, null, '', 12, {}, 'x'.repeat(257)]) {
    assert.throws(() => validateStudentPassword(password), { status: 422 });
    assert.equal(await verifyStudentPassword(password, 'invalid'), false);
  }
  for (const hash of [null, '', 'scrypt:bad:bad', 'other:salt:hash']) {
    assert.equal(await verifyStudentPassword('12', hash), false);
  }
});
