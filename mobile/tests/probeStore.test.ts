import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { ProbeStore, type DatabasePort, type ProbeRecord, validateRecord } from '../src/domain/probeStore';

function sqlitePort(database: DatabaseSync): DatabasePort {
  const port: DatabasePort = {
    exec: async sql => { database.exec(sql); },
    run: async (sql, ...params) => { database.prepare(sql).run(...params); },
    first: async (sql, ...params) => {
      const row = database.prepare(sql).get(...params);
      return row ? { payload: String(row.payload) } : null;
    },
    transaction: async work => {
      database.exec('BEGIN');
      try { await work(port); database.exec('COMMIT'); }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  };
  return port;
}
const scope = { tenant: 'test-tenant', account: 'student-1' };
const fixture: ProbeRecord = { kind: 'session', operationId: 'operation-1',
  selectedLocations: ['1:1:1', '1:1:2'], createdAt: '2026-10-14T09:00:00.000Z' };

test('draft and session survive closing and reopening a file-backed SQLite database', async context => {
  const directory = mkdtempSync(join(tmpdir(), 'nukhab-native-store-test-'));
  const filename = join(directory, 'probe.db');
  context.after(() => {
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()), 'Cleanup must stay in the intended temp directory');
    assert.ok(basename(target).startsWith('nukhab-native-store-test-'), 'Cleanup must use the test-created prefix');
    rmSync(target, { recursive: true });
  });
  const database = new DatabaseSync(filename);
  const port = sqlitePort(database);
  const firstStore = new ProbeStore(port, scope);
  await firstStore.initialize();
  await firstStore.save([fixture, { ...fixture, kind: 'draft' }]);
  database.close();
  const reopened = new DatabaseSync(filename);
  const nextStore = new ProbeStore(sqlitePort(reopened), scope);
  assert.deepEqual(await nextStore.restore('session', fixture.operationId), fixture);
  assert.deepEqual(await nextStore.restore('draft', fixture.operationId), { ...fixture, kind: 'draft' });
  reopened.close();
});

test('retries keep a single immutable operation without overwriting the original', async () => {
  const database = new DatabaseSync(':memory:');
  const store = new ProbeStore(sqlitePort(database), scope);
  await store.initialize();
  await store.save([fixture]);
  await store.save([{ ...fixture, selectedLocations: ['1:7:9'] }]);
  assert.deepEqual(await store.restore('session', fixture.operationId), fixture);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM native_probe_records').get()?.count, 1);
  database.close();
});

test('same operation is isolated by account and tenant', async () => {
  const database = new DatabaseSync(':memory:');
  const port = sqlitePort(database);
  const first = new ProbeStore(port, scope);
  await first.initialize(); await first.save([fixture]);
  assert.equal(await new ProbeStore(port, { ...scope, account: 'student-2' }).restore('session', fixture.operationId), null);
  assert.equal(await new ProbeStore(port, { ...scope, tenant: 'other-tenant' }).restore('session', fixture.operationId), null);
  database.close();
});

test('failure on the second record rolls back the complete pair', async () => {
  const database = new DatabaseSync(':memory:');
  const port = sqlitePort(database);
  const store = new ProbeStore(port, scope);
  await store.initialize();
  const run = port.run;
  let calls = 0;
  port.run = async (...args) => { if (++calls === 2) throw new Error('fixture write failure'); await run(...args); };
  await assert.rejects(store.save([fixture, { ...fixture, kind: 'draft' }]), /fixture write failure/);
  assert.equal(await store.restore('session', fixture.operationId), null);
  database.close();
});

test('invalid context and corrupted payload fail without deleting existing records', async () => {
  const database = new DatabaseSync(':memory:');
  const port = sqlitePort(database);
  assert.throws(() => new ProbeStore(port, { tenant: "' OR 1=1", account: 'x' }), /سياق/);
  const store = new ProbeStore(port, scope);
  await store.initialize(); await store.save([fixture]);
  await port.run('UPDATE native_probe_records SET payload = ?', '{bad json');
  await assert.rejects(store.restore('session', fixture.operationId), SyntaxError);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM native_probe_records').get()?.count, 1);
  database.close();
});

test('invalid record is rejected before writing any record', () => {
  for (const invalid of [null, { ...fixture, kind: 'unknown' }, { ...fixture, createdAt: 'bad' },
    { ...fixture, selectedLocations: ['bad'] }, { ...fixture, operationId: "'" }]) {
    assert.throws(() => validateRecord(invalid), /غير صالحة/);
  }
});
