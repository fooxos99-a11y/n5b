import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { instrumentDatabase, requestDiagnostics } from '../server/services/requestDiagnostics.js';
import { createSharedPreparation } from '../server/services/sharedPreparation.js';
import { adjacentPosition, loadAdjacentQuranPosition } from '../server/services/quranTraversalIndex.js';
import { registerDeviceTransaction } from '../server/services/recitationDeviceRegistration.js';
import { expireQuranTasks } from '../server/services/expireQuranTasks.js';
import { publicErrorMessage } from '../server/services/publicErrors.js';
import { selectRecitationPrefetchTasks, supportsIndividualSyncFallback, recitationTaskCacheVersion } from '../src/lib/recitationPrefetchPolicy.js';
import * as migration from '../server/migrations/2026.09.06.3-recitation-performance-indexes.js';

test('Quran binary traversal matches all boundaries without per-ayah database queries', async () => {
  const data = JSON.parse(await readFile(new URL('../server/data/quran-pages.json', import.meta.url), 'utf8'));
  const rows = data.ayahs.map((row) => ({ page: row.page, surah: row.surah, ayah: row.ayah }));
  assert.equal(rows.length, 6236);
  assert.ok(rows.every((row) => row.page > 0 && row.surah > 0 && row.ayah > 0));
  rows.sort((a, b) => a.page - b.page || a.surah - b.surah || a.ayah - b.ayah);
  let calls = 0;
  const connection = { query: async () => { calls += 1; return [rows]; } };
  for (let index = 0; index < rows.length; index += 1) {
    assert.deepEqual(await loadAdjacentQuranPosition(connection, rows[index], 'next'), rows[index + 1] || null);
    assert.deepEqual(adjacentPosition(rows, rows[index], true), rows[index - 1] || null);
  }
  assert.equal(calls, 1);
  const secondDatabase = { query: async () => [[]] };
  assert.equal(await loadAdjacentQuranPosition(secondDatabase, rows[0], 'next'), null);
});

test('failed Quran cache loads are retryable', async () => {
  let calls = 0;
  const connection = { query: async () => { if (++calls === 1) throw new Error('disconnected'); return [[]]; } };
  await assert.rejects(loadAdjacentQuranPosition(connection, {}, 'next'), /disconnected/);
  assert.equal(await loadAdjacentQuranPosition(connection, {}, 'next'), null);
  assert.equal(calls, 2);
});

test('concurrent preparation shares only the same tenant/account/window and retries failures', async () => {
  const prepare = createSharedPreparation();
  let release;
  let calls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const run = () => { calls += 1; return gate; };
  const first = prepare('tenant-a:teacher-1:today', run);
  assert.equal(prepare('tenant-a:teacher-1:today', run), first);
  const other = prepare('tenant-b:teacher-1:today', run);
  release('ready');
  await Promise.all([first, other]);
  assert.equal(calls, 2);
  await assert.rejects(prepare('failed', () => { throw new Error('retry'); }), /retry/);
  assert.equal(await prepare('failed', () => 'recovered'), 'recovered');
});

test('request diagnostics correlate pool and query work without logging inputs', async (t) => {
  const output = [];
  t.mock.method(process.stdout, 'write', (value) => { output.push(String(value)); return true; });
  let releases = 0;
  const connection = { query: async () => [[{ ok: true }]], release: () => { releases += 1; } };
  const pool = instrumentDatabase({ getConnection: async () => connection, query: async () => [[]] }, 'test', { pool: true });
  const res = new EventEmitter();
  res.statusCode = 500;
  res.writableFinished = true;
  res.setHeader = (name, value) => { assert.equal(name, 'X-Request-Id'); assert.match(value, /^[a-f0-9-]{36}$/); };
  const req = { method: 'GET', get: () => '01234567-89ab-4cde-8fab-0123456789ab', route: { path: '/students/:id' }, url: '/students/123?secret=private' };
  await new Promise((resolve, reject) => requestDiagnostics(req, res, () => {
    void (async () => {
      const db = await pool.getConnection();
      assert.deepEqual(await db.query('SELECT ? AS private', ['secret-student']), [[{ ok: true }]]);
      await pool.query('SELECT 1');
      res.emit('finish');
      res.emit('close');
    })().then(resolve, reject);
  }));
  assert.equal(output.length, 1);
  const record = JSON.parse(output[0]);
  assert.equal(record.sqlCount, 2);
  assert.equal(releases, 1);
  assert.equal(record.requestId, req.traceId);
  assert.equal(record.requestId, req.get());
  assert.equal(record.route, '/students/:id');
  assert.doesNotMatch(output[0], /secret-student|SELECT|private|students\/123/);
});

test('device lock commits before task preparation and failed registration rolls back', async () => {
  const events = [];
  const connection = Object.fromEntries(['beginTransaction', 'commit', 'rollback'].map((key) => [key, async () => events.push(key)]));
  const anchor = await registerDeviceTransaction(connection, {}, async () => { events.push('register'); return { deviceId: 'device' }; });
  events.push('prepareTasks');
  assert.deepEqual(events, ['beginTransaction', 'register', 'commit', 'prepareTasks']);
  assert.equal(anchor.deviceId, 'device');
  events.length = 0;
  await assert.rejects(registerDeviceTransaction(connection, {}, async () => { throw new Error('wrong owner'); }), /wrong owner/);
  assert.deepEqual(events, ['beginTransaction', 'rollback']);
  const route = await readFile(new URL('../server/routes/offlineRecitationRoutes.js', import.meta.url), 'utf8');
  assert.ok(route.indexOf('await registerDeviceTransaction') < route.indexOf('await prepareOfflineWindow'));
  assert.doesNotMatch(route, /connection.beginTransaction|connection.commit/);
});

test('expired tasks are updated by bounded primary keys with completion rechecked', async () => {
  let scan = 0;
  const writes = [];
  await expireQuranTasks({ query: async (sql, params) => {
    if (sql.startsWith('SELECT')) {
      assert.equal(params[0], '2026-09-06');
      assert.equal(params[1], scan === 0 ? 0 : 2);
      return [scan++ === 0 ? [{ id: 1 }, { id: 2 }] : []];
    }
    assert.match(sql, /WHERE id IN \(\?,\?\)/);
    assert.match(sql, /teacher_completed IS NULL[\s\S]*AND task_date < \?/);
    writes.push(params);
    return [{ affectedRows: 1 }];
  } }, '2026-09-06');
  assert.deepEqual(writes, [[1, 2, '2026-09-06']]);
});

test('automatic prefetch is bounded to today while explicit offline preparation keeps future tasks', () => {
  const today = Array.from({ length: 40 }, (_, id) => ({ id: id + 1, taskDate: '2026-09-06', taskType: 'memorization' }));
  const future = { id: 50, taskDate: '2026-09-07', taskType: 'memorization' };
  const all = [...today, today[0], future];
  assert.equal(selectRecitationPrefetchTasks(all, { automatic: true, date: '2026-09-06' }).length, 24);
  assert.equal(selectRecitationPrefetchTasks(all).length, 41);
  assert.deepEqual(selectRecitationPrefetchTasks([
    { id: 1, taskType: 'repeat' }, { id: 2, taskType: 'review' },
    { id: 3, taskType: 'memorization' }, { id: 4, taskType: 'link' },
  ]).map(task => task.id), [2, 3, 4]);
  assert.notEqual(recitationTaskCacheVersion({ planVersion: 1 }), recitationTaskCacheVersion({ planVersion: 2 }));
  for (const status of [429, 500, 502, 503, 504, undefined]) assert.equal(supportsIndividualSyncFallback({ status }), false);
  for (const status of [404, 405, 501]) assert.equal(supportsIndividualSyncFallback({ status }), true);
});

test('database exceptions cannot leak SQL through recitation error messages', () => {
  for (const code of ['ER_CHECK_CONSTRAINT_VIOLATED', 'ER_LOCK_WAIT_TIMEOUT', 'ER_LOCK_DEADLOCK', 'UNKNOWN']) {
    assert.doesNotMatch(publicErrorMessage({ code, message: 'secret SQL payload', sql: 'SELECT secret' }), /secret|SELECT/);
  }
});

test('performance indexes are idempotent and can roll back independently', async () => {
  const existing = new Set();
  const connection = { query: async (sql, params) => {
    if (sql.startsWith('SELECT')) return [[{ count: existing.has(params[1]) ? 1 : 0 }]];
    const match = sql.match(/(ADD|DROP) INDEX (\w+)/);
    assert.ok(match);
    if (match[1] === 'ADD') { assert.equal(existing.has(match[2]), false); existing.add(match[2]); }
    else existing.delete(match[2]);
    return [];
  } };
  await migration.up(connection); await migration.up(connection);
  assert.equal(existing.size, 2);
  await migration.down(connection); await migration.down(connection);
  assert.equal(existing.size, 0);
});

test('external theme bootstrap preserves account, public and path-based themes without inline script', async () => {
  const source = await readFile(new URL('../public/theme-bootstrap.js', import.meta.url), 'utf8');
  for (const [base, pathname, expected] of [['/', '/portal', 'light'], ['/n5b/', '/n5b/dashboard', 'light'], ['/', '/', 'light']]) {
    let theme;
    const document = { currentScript: { dataset: { base } }, documentElement: { classList: { add(value) { theme = value; } }, style: {} } };
    vm.runInNewContext(source, { document, location: { pathname }, localStorage: { getItem: () => null } });
    assert.equal(theme, expected);
  }
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /theme-bootstrap.js/);
});
