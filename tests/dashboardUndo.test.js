import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardUndo } from '../server/services/dashboardUndo.js';
import { undoContext, restoreJournal } from '../server/services/undoJournal.js';

test('undo capture excludes external operations without excluding similar local paths', () => {
  const { capture } = createDashboardUndo({});
  const excluded = ['/api/auth', '/api/auth/login', '/api/calls/1', '/api/whatsapp/send', '/api/backups', '/api/notification-management/settings', '/api/account-deletion', '/api/reports/send', '/api/reports/send-whatsapp', '/api/reset-points', '/api/delete-program-data', '/api/end-term'];
  const included = ['/api/students/1', '/api/authors', '/api/callsign', '/api/reports/send/draft', '/api/reset-points-preview'];
  for (const path of [...excluded, ...included]) {
    const req = { path, method: 'POST', auth: { role: 'manager' }, get: () => '1' };
    const res = { json() {}, on() {} };
    let visited = false;
    capture(req, res, () => {
      visited = true;
      assert.equal(Boolean(undoContext.getStore()), included.includes(path), path);
    });
    assert.equal(visited, true);
  }
});

test('journal restoration preserves reverse group order and increments revisions', async () => {
  const meta = { table: 'items', primaryKey: ['id'], jsonColumns: ['content'] };
  const first = { key: 'items:1', meta, before: { id: 1, content: { title: 'old' }, revision: 1 }, after: { id: 1, content: { title: 'middle' }, revision: 2 } };
  const second = { ...first, before: first.after, after: { id: 1, content: { title: 'new' }, revision: 3 } };
  const writes = [];
  const connection = { query: async (sql, values) => {
    if (sql.startsWith('SELECT')) return [[second.after]];
    writes.push({ sql, values });
    return [{}];
  } };
  await restoreJournal(connection, [[first], [second]]);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes.map(write => JSON.parse(write.values[0].content).title), ['middle', 'old']);
  for (const write of writes) {
    assert.match(write.sql, /`revision` = `revision` \+ 1/);
    assert.equal(Object.hasOwn(write.values[0], 'revision'), false);
  }
  writes.length = 0;
  connection.query = async () => [[{ ...second.after, revision: 4 }]];
  await assert.rejects(restoreJournal(connection, [[first], [second]]), /Concurrent modification/);
  assert.equal(writes.length, 0);
});
