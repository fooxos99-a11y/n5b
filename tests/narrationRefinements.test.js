import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { groupNarrationParts, narrationOverallScore } from '../src/lib/narrationParts.js';

test('partial and zero narration grades remain visible without marking untouched parts as evaluated', () => {
  const groups = groupNarrationParts([{ id: 1, juzNumber: 1, score: 0 }, { id: 2, juzNumber: 1, score: null }, { id: 3, juzNumber: 2, score: 80 }, { id: 4, juzNumber: 3, score: null }]);
  assert.equal(groups[0].evaluated, true);
  assert.equal(groups[0].score, 0);
  assert.equal(groups[2].evaluated, false);
  assert.equal(narrationOverallScore(groups), 40);
});

test('starting narration preserves results and records authenticated names, including another reciter', async () => {
  const source = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const start = source.indexOf("app.put('/api/narration-events/:eventId/students/:studentEntryId/status'");
  const end = source.indexOf("app.post('/api/narration-events/:id/archive'", start);
  let handler;
  const writes = [];
  const connection = {
    query: async (sql, values) => {
      if (sql.startsWith('SELECT')) return [[{ committeeId: 5, archivedAt: null }]];
      writes.push({sql, values}); return [{affectedRows: 1}];
    }, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
  };
  vm.runInNewContext(source.slice(start, end), {
    app: {put: (_path, _guard, callback) => { handler = callback; }}, requireNarrationAccess: () => {},
    db: () => ({getConnection: async () => connection}), canAccessNarrationCommittee: async () => true,
  });
  for (const [id, name] of [[1, 'أحمد المعلم'], [2, 'محمد المدير']]) {
    const response = {json: value => assert.equal(value.ok, true)};
    await handler({params:{eventId:'7',studentEntryId:'11'},body:{status:'in_progress'},auth:{id,name,role:'manager'}}, response, error => {throw error;});
  }
  assert.deepEqual(writes.filter(row => row.sql.startsWith('INSERT')).map(row => row.values[3]), ['أحمد المعلم','محمد المدير']);
  for (const row of writes.filter(row => row.sql.startsWith('UPDATE'))) {
    assert.doesNotMatch(row.sql, /final_score|final_rating/);
    assert.match(row.sql, /IF\(es.status = 'completed'/);
    assert.deepEqual(Array.from(row.values), ['in_progress',11,7]);
  }
});
