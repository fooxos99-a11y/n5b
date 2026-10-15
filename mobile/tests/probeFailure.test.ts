import assert from 'node:assert/strict';
import test from 'node:test';
import { atProbeStage, formatProbeFailure, ProbeFailure } from '../src/domain/probeFailure';

test('native failure diagnostics expose only fixed stage, kind, and category', async () => {
  const sensitive = 'PRAGMA key secret-value file:///private/store.db SELECT payload';
  await assert.rejects(atProbeStage('database-key', () => { throw new TypeError(sensitive); }), cause => {
    const text = formatProbeFailure(cause);
    assert.match(text, /database-key/);
    assert.match(text, /TypeError/);
    assert.match(text, /runtime-error/);
    for (const value of ['PRAGMA', 'secret-value', 'file:///private/store.db', 'SELECT', 'payload']) {
      assert.equal(text.includes(value), false);
    }
    return true;
  });
});

test('known safety failures keep their category without copying a native message', async () => {
  await assert.rejects(atProbeStage('database-file-check', () => {
    throw new ProbeFailure('database-file-check', 'missing-key');
  }), cause => {
    assert.match(formatProbeFailure(cause), /missing-key/);
    assert.match(formatProbeFailure(cause), /احتفظ ببيانات التجربة/);
    return true;
  });
  assert.equal(formatProbeFailure(new Error('بيانات سرية')), formatProbeFailure(null));
});
