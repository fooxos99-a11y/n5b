import { currentQuranPlanSql } from '../server/services/currentQuranPlan.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { singleFlight, limitedTaskQueue } from '../src/lib/asyncRequests.js';
import { createRefreshGate } from '../src/lib/refreshGate.js';

function offlineHarness() {
  const source = readFileSync(new URL('../src/services/offlineOperationsService.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  let session = 1;
  const calls = [];
  const snapshots = new Map();
  const api = new Proxy({}, { get: (_, name) => async () => { calls.push(name); return []; } });
  const store = { getSnapshot: async key => snapshots.get(key), cacheSnapshot: async (key, value) => snapshots.set(key, value) };
  const create = new Function('studentsApi', 'getTenantRegistrationNumber', 'offlineRecitationStore', 'getBusinessDate', 'shiftDateOnly', 'singleFlight', 'limitedTaskQueue', 'createRefreshGate', 'getAuthSessionVersion', `${source}\nreturn {loadOfflineSnapshot, prefetchOfflineManagementWorkspace};`);
  return { ...create(api, () => 'tenant', store, () => '2026-09-09', () => '', singleFlight, limitedTaskQueue, createRefreshGate, () => session), calls, newSession: () => { session++; } };
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

test('active plan totals restrict every aggregate to the requested student with bound parameters', async () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const start = source.indexOf('async function getActivePlanForStudent(');
  const end = source.indexOf('\nfunction normalizeTaskRow(', start);
  const getPlan = new Function('currentQuranPlanSql','acceptedMemorizationSql','normalizePlanRow', `${source.slice(start,end)}; return getActivePlanForStudent;`)(currentQuranPlanSql, () => 'teacher_completed = 1', row => row);
  let query;
  const plan = await getPlan({query:async (sql, params) => { query={sql,params};return [[{id:42}]]; }},863);
  assert.equal(plan.id,42);
  assert.deepEqual(query.params,[863,863,863,863]);
  assert.equal((query.sql.match(/\?/g)||[]).length,4);
  assert.equal((query.sql.match(/student_id = \?/g)||[]).length,4);
  assert.match(query.sql,/WHERE schedule_p.student_id = \? AND schedule_p.status IN \('active', 'completed'\)/);
});
