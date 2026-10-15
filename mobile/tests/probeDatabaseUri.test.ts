import assert from 'node:assert/strict';
import test from 'node:test';
import { probeDatabaseDirectoryUri } from '../src/domain/probeDatabaseUri';
import { ProbeFailure } from '../src/domain/probeFailure';

test('Android raw SQLite directory becomes a file URI for the same absolute directory', () => {
  const original = '/data/user/0/sa.nukhab.app/files/SQLite';
  const uri = probeDatabaseDirectoryUri(original);
  assert.equal(uri, `file://${original}`);
  assert.equal(decodeURIComponent(new URL(uri).pathname), original);
});

test('existing file URI remains unchanged and raw special characters stay in the path', () => {
  const existing = 'file:///private/app/Library/Application%20Support/SQLite';
  assert.equal(probeDatabaseDirectoryUri(existing), existing);
  const original = '/private/نخب #1?/SQLite';
  const url = new URL(probeDatabaseDirectoryUri(original));
  assert.equal(decodeURIComponent(url.pathname), original);
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
});

test('missing or nonlocal directories fail without substituting a different storage directory', () => {
  for (const invalid of [null, undefined, '', 'SQLite', 'content://fixture/SQLite', '//host/SQLite', 'file://host/SQLite']) {
    assert.throws(() => probeDatabaseDirectoryUri(invalid), cause => {
      assert.ok(cause instanceof ProbeFailure);
      assert.equal(cause.stage, 'database-file-check');
      assert.equal(cause.code, 'database-path-invalid');
      return true;
    });
  }
});
