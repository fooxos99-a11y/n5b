import assert from 'node:assert/strict';
import test from 'node:test';
import { LOGIN_NUMBER_MAX_LENGTH, normalizeLoginNumber, prepareLoginCredentials } from '../src/domain/loginForm';

test('Arabic, Persian and English digits normalize consistently with the current numeric input', () => {
  assert.equal(normalizeLoginNumber('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normalizeLoginNumber('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeLoginNumber(' ٠0۱1-٢2 ۳3abc '), '00112233');
  assert.equal(normalizeLoginNumber('12'.repeat(20)).length, LOGIN_NUMBER_MAX_LENGTH);
});

test('login identifiers remain strings with leading zeros and values beyond safe integer precision', () => {
  assert.deepEqual(prepareLoginCredentials('٠٠١٢٣', 'password'), {
    ok: true, credentials: { loginNumber: '00123', password: 'password' },
  });
  const long = '90071992547409931234';
  assert.deepEqual(prepareLoginCredentials(long, 'password'), {
    ok: true, credentials: { loginNumber: long, password: 'password' },
  });
});

test('missing and nondigit identifiers block submission without credentials', () => {
  for (const value of ['', '   ', 'abc', '++--']) {
    assert.deepEqual(prepareLoginCredentials(value, 'private password'), {
      ok: false, errors: { loginNumber: 'أدخل رقم الدخول.' },
    });
  }
});

test('password is never normalized or trimmed and empty password remains a server decision', () => {
  for (const password of ['', '  نص ١٢۳ Password\n', 'a'.repeat(256)]) {
    assert.deepEqual(prepareLoginCredentials('123', password), {
      ok: true, credentials: { loginNumber: '123', password },
    });
  }
});

test('oversized password fails locally and validation errors contain no credentials', () => {
  const result = prepareLoginCredentials('123', 'secret-value'.repeat(30));
  assert.deepEqual(result, { ok: false, errors: { password: 'كلمة المرور أطول من الحد المسموح.' } });
  assert.equal(JSON.stringify(result).includes('secret-value'), false);
});
