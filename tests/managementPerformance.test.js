import { currentQuranPlanSql } from '../server/services/currentQuranPlan.js';
import test from 'node:test';
import { studyDateSql } from '../server/services/seasonalHolidays.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { singleFlight, limitedTaskQueue } from '../src/lib/asyncRequests.js';
import { createRefreshGate } from '../src/lib/refreshGate.js';

function offlineHarness({ readError, writeError, online = true } = {}) {
  const source = readFileSync(new URL('../src/services/offlineOperationsService.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  let session = 1;
  const calls = [];
  const snapshots = new Map();
  const api = new Proxy({}, { get: (_, name) => async () => { calls.push(name); return []; } });
  const store = {
    getSnapshot: async key => { if (readError) throw readError; return snapshots.get(key); },
    cacheSnapshot: async (key, value) => { if (writeError) throw writeError; return snapshots.set(key, value); },
  };
  const create = new Function('studentsApi', 'getTenantRegistrationNumber', 'offlineRecitationStore', 'getBusinessDate', 'shiftDateOnly', 'singleFlight', 'limitedTaskQueue', 'createRefreshGate', 'getAuthSessionVersion', 'navigator', `${source}\nreturn {loadOfflineSnapshot, prefetchOfflineManagementWorkspace};`);
  return { ...create(api, () => 'tenant', store, () => '2026-09-09', () => '', singleFlight, limitedTaskQueue, createRefreshGate, () => session, { onLine: online }), calls, newSession: () => { session++; } };
}

test('automatic management preparation avoids hidden reports and respects actor/session isolation', async () => {
  const h = offlineHarness();
  await Promise.all([h.prefetchOfflineManagementWorkspace(1, 'manager', {automatic:true}), h.prefetchOfflineManagementWorkspace(1, 'manager', {automatic:true})]);
  await h.prefetchOfflineManagementWorkspace(1, 'manager', {automatic:true});
  assert.deepEqual(h.calls, ['getCommittees']);
  await h.prefetchOfflineManagementWorkspace(2, 'manager', {automatic:true});
  h.newSession();
  await h.prefetchOfflineManagementWorkspace(1, 'manager', {automatic:true});
  assert.equal(h.calls.length, 3);
});

test('snapshot reads coalesce concurrent same-resource requests but do not reuse stale results', async () => {
  const h = offlineHarness(); let count = 0;
  const loader = async () => { count++; await new Promise(resolve => setTimeout(resolve, 5)); return count; };
  const values = await Promise.all([h.loadOfflineSnapshot(1,'report',loader),h.loadOfflineSnapshot(1,'report',loader)]);
  assert.deepEqual(values,[1,1]);
  await h.loadOfflineSnapshot(1,'report',loader); assert.equal(count,2);
  await Promise.all([h.loadOfflineSnapshot(1,'report',loader),h.loadOfflineSnapshot(2,'report',loader)]);
  assert.equal(count,4);
});

for (const operation of ['readError', 'writeError']) test(`online statistics survive a local snapshot ${operation}`, async () => {
  const h = offlineHarness({ [operation]: new Error('Local storage unavailable') });
  let requests = 0;
  assert.deepEqual(await h.loadOfflineSnapshot(1, 'report', async () => { requests++; return { count: 12 }; }), { count: 12 });
  assert.equal(requests, 1);
});

test('offline snapshot failure never pretends the report was loaded', async () => {
  const h = offlineHarness({ readError: new Error('Local storage unavailable'), online: false });
  let requests = 0;
  await assert.rejects(h.loadOfflineSnapshot(1, 'report', async () => { requests++; return {}; }), /Local storage unavailable/);
  assert.equal(requests, 0);
});

for (const status of [401, 403]) test(`saved reports cannot hide a server access denial ${status}`, async () => {
  const h = offlineHarness();
  await h.loadOfflineSnapshot(1, 'report', async () => ({ count: 12 }));
  await assert.rejects(h.loadOfflineSnapshot(1, 'report', async () => { throw Object.assign(new Error('Access denied'), { status }); }), { status });
});

test('active plan totals restrict every aggregate to the requested student with bound parameters', async () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function getActivePlanForStudent(');
  const end = source.indexOf('\nfunction normalizeTaskRow(', start);
  const getPlan = new Function('currentQuranPlanSql','acceptedMemorizationSql','normalizePlanRow','studyDateSql', `${source.slice(start,end)}; return getActivePlanForStudent;`)(currentQuranPlanSql, () => 'teacher_completed = 1', row => row, studyDateSql);
  let query;
  const plan = await getPlan({query:async (sql, params) => { query={sql,params};return [[{id:42}]]; }},863);
  assert.equal(plan.id,42);
  assert.deepEqual(query.params,[863,863,863,863]);
  assert.equal((query.sql.match(/\?/g)||[]).length,4);
  assert.equal((query.sql.match(/student_id = \?/g)||[]).length,4);
  assert.match(query.sql,/WHERE schedule_p.student_id = \? AND schedule_p.status IN \('active', 'completed'\)/);
});
