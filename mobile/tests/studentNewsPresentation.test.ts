import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStudentNews } from '../src/domain/studentDashboard';
import { NativeApiError } from '../src/services/nativeApi';

test('student news preserves the authoritative text color and existing default', () => {
  const entry = { id: 'native-news', title: 'خبر', body: 'تفاصيل', image: '' };
  assert.equal(decodeStudentNews({ entries: [entry] })[0]?.textColor, '#000000');
  assert.equal(decodeStudentNews({ entries: [{ ...entry, textColor: '#aBc123' }] })[0]?.textColor, '#aBc123');
  for (const textColor of ['red', 'url(https://invalid.test)', '#abc', '#12345678', 1]) {
    assert.throws(() => decodeStudentNews({ entries: [{ ...entry, textColor }] }),
      cause => cause instanceof NativeApiError && cause.code === 'invalid-response');
  }
});
