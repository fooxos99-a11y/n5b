import assert from 'node:assert/strict';
import console from 'node:console';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { offlineRecitationStore as store } from '../src/services/offlineRecitationStore.js';

// Exercise the native storage SQL against SQLite without changing a device database.
const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE offline_recitation_sessions (
  session_id TEXT PRIMARY KEY, actor_key TEXT, student_id INTEGER, session_date TEXT, session_type TEXT,
  status TEXT, payload_json TEXT, created_at_local TEXT, updated_at_local TEXT, next_retry_at TEXT, last_error TEXT);
  CREATE TABLE offline_drafts (key TEXT PRIMARY KEY,payload_json TEXT,updated_at TEXT);`);
let failDraftDelete = false;
store.driver = 'sqlite';
store.connection = {
  query: async (sql, values = []) => ({ values: database.prepare(sql).all(...values) }),
  run: async (sql, values = []) => {
    if (failDraftDelete && sql.startsWith('DELETE FROM offline_drafts')) throw new Error('Simulated draft write failure');
    return database.prepare(sql).run(...values);
  },
  beginTransaction: async () => database.exec('BEGIN'),
  commitTransaction: async () => database.exec('COMMIT'),
  rollbackTransaction: async () => database.exec('ROLLBACK'),
};
const actor = 'retry-test:supervisor:7';
const first = { sessionId: randomUUID(), studentId: 8, sessionDate: '2026-11-01', sessionType: 'review',
  tasks: [{ taskId: 1, taskType: 'review', planId: 3, planVersion: 2, payload: { mistakeCount: 1 } }] };
try {
  await store.commitSession(actor, first);
  await store.updateSession(actor, first.sessionId, { status: 'synced' });
  const retry = { ...first, sessionId: randomUUID(), retryOf: first.sessionId, draftKey: '8:review:first-retry' };
  await store.saveDraft(actor, retry.draftKey, { mode: 'count', itemCounts: {} });
  const saved = await store.commitSession(actor, retry);
  assert.equal(saved.retryOf, first.sessionId);
  assert.equal((await store.getSessions(actor)).length, 2);
  assert.equal(await store.getDraft(actor, retry.draftKey), null);
  await assert.rejects(store.commitSession(actor, { ...retry, sessionId: randomUUID() }), /انتظر مزامنة/);
  await store.updateSession(actor, retry.sessionId, { status: 'synced' });
  const next = { ...retry, sessionId: randomUUID(), retryOf: retry.sessionId, draftKey: '8:review:second-retry' };
  await store.saveDraft(actor, next.draftKey, { mode: 'count', itemCounts: { 1: { mistakeCount: 2 } } });
  failDraftDelete = true;
  await assert.rejects(store.commitSession(actor, next), /Simulated/);
  assert.equal((await store.getSessions(actor)).length, 2, 'A failed atomic save leaves the earlier sessions intact');
  assert.equal((await store.getDraft(actor, next.draftKey)).itemCounts[1].mistakeCount, 2);
  failDraftDelete = false;
  await store.commitSession(actor, next);
  const sessions = await store.getSessions(actor);
  assert.equal(sessions.length, 3);
  assert.equal(sessions.find(row => row.sessionId === first.sessionId).tasks[0].payload.mistakeCount, 1);
  console.log(JSON.stringify({ passed: true, sqlite: true, checks: ['attempt retention', 'retry chain', 'pending guard', 'draft cleanup', 'atomic rollback'] }));
} finally { database.close(); }
