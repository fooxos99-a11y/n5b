import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runRecitationSessionTransaction, assertRecitationReplacementCoverage } from '../server/services/recitationSessionTransaction.js';

function database() {
  let state = { owner: 'previous', official: [1, 2], points: 24, jobs: [] };
  let original;
  let part;
  const calls = [];
  const connection = {
    beginTransaction: async () => { original = structuredClone(state); calls.push('begin'); },
    commit: async () => { calls.push('commit'); },
    rollback: async () => { state = structuredClone(original); calls.push('rollback'); },
    release: () => { calls.push('release'); },
    query: async (sql) => {
      if (sql === 'SAVEPOINT recitation_part') part = structuredClone(state);
      else if (sql === 'ROLLBACK TO SAVEPOINT recitation_part') state = structuredClone(part);
      else if (sql === 'replace') { state.owner = 'replacement'; state.official = []; state.points = 0; }
      else if (sql === 'first') { state.official.push(3); state.points += 12; state.jobs.push(3); }
      else if (sql === 'second') { state.official.push(4); state.points += 12; state.jobs.push(4); }
      else throw new Error(`Unexpected query: ${sql}`);
      return [{}];
    },
  };
  return { pool: { getConnection: async () => connection }, connection, calls, state: () => state };
}

test('failure of the second replacement part restores the previous owner, results, points and queue', async () => {
  const db = database();
  const before = structuredClone(db.state());
  const result = await runRecitationSessionTransaction(db.pool, async (connection, transaction) => {
    await connection.beginTransaction();
    transaction.superseded = true;
    await connection.query('replace');
    await connection.query('first');
    await connection.commit();
    assert.deepEqual(db.calls, ['begin']); // No intermediate real commit or release.
    connection.release();
    await connection.beginTransaction();
    await connection.query('second');
    await connection.rollback();
    transaction.failed = true;
    return ['first accepted internally', 'second failed'];
  });
  assert.equal(result.rolledBack, true);
  assert.deepEqual(db.state(), before);
  assert.deepEqual(db.calls, ['begin', 'rollback', 'release']);
});

test('complete replacement commits once after both parts and preserves the queue with its results', async () => {
  const db = database();
  const result = await runRecitationSessionTransaction(db.pool, async (connection, transaction) => {
    transaction.superseded = true;
    await connection.beginTransaction();
    await connection.query('replace');
    for (const sql of ['first', 'second']) {
      await connection.beginTransaction();
      await connection.query(sql);
      await connection.commit();
    }
  });
  assert.equal(result.rolledBack, false);
  assert.deepEqual(db.state(), { owner: 'replacement', official: [3, 4], points: 24, jobs: [3, 4] });
  assert.deepEqual(db.calls, ['begin', 'commit', 'release']);
});

test('ordinary partial sessions retain their accepted first part', async () => {
  const db = database();
  const result = await runRecitationSessionTransaction(db.pool, async (connection, transaction) => {
    await connection.beginTransaction();
    await connection.query('first');
    await connection.commit();
    await connection.beginTransaction();
    await connection.query('second');
    await connection.rollback();
    transaction.failed = true;
  });
  assert.equal(result.rolledBack, false);
  assert.deepEqual(db.state(), { owner: 'previous', official: [1, 2, 3], points: 36, jobs: [3] });
});

test('unexpected exception or lost savepoint rolls back the entire transaction and releases once', async () => {
  const db = database();
  await assert.rejects(runRecitationSessionTransaction(db.pool, async (connection) => {
    await connection.beginTransaction();
    await connection.query('first');
    throw new Error('connection lost');
  }), /connection lost/);
  assert.equal(db.state().points, 24);
  assert.deepEqual(db.calls, ['begin', 'rollback', 'release']);
  const broken = database();
  const query = broken.connection.query;
  broken.connection.query = async (sql) => {
    if (sql.startsWith('ROLLBACK TO')) throw new Error('savepoint lost');
    return query(sql);
  };
  const result = await runRecitationSessionTransaction(broken.pool, async (connection, transaction) => {
    await connection.beginTransaction();
    await connection.query('first');
    try { await connection.rollback(); } catch { transaction.failed = true; }
  });
  assert.equal(result.rolledBack, true);
  assert.equal(broken.state().points, 24);
});

test('replacement must cover every accepted part and official legacy attempt', async () => {
  const connection = { query: async (sql, values) => {
    assert.match(sql, /status = 'accepted'/);
    assert.match(sql, /UNION SELECT[\s\S]*is_official = 1/);
    assert.deepEqual(values, ['previous', 'previous', 'previous:%']);
    return [[{ taskId: 1 }, { taskId: 2 }]];
  } };
  await assert.rejects(assertRecitationReplacementCoverage(connection, 'previous', [1]), { statusCode: 409 });
  await assertRecitationReplacementCoverage(connection, 'previous', [1, 2]);
});

test('batch wiring shares the connection, waits for handler cleanup and removes rolled-back acknowledgements', async () => {
  const server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  const service = await readFile(new URL('../server/services/offlineRecitation.js', import.meta.url), 'utf8');
  assert.match(server, /const connection = req.recitationConnection \|\| await db\(\).getConnection\(\)/);
  assert.match(server, /await rateSupervisorQuranTaskHandler\(request, response/);
  assert.match(server, /runRecitationSessionTransaction\(db\(\), async \(connection, transaction\)/);
  assert.match(server, /if \(outcome.rolledBack\)[\s\S]*result: 'needs_retry', data: null/);
  assert.ok(service.indexOf('await assertRecitationReplacementCoverage') < service.indexOf("rejection_code = ?, rejection_message = ?"));
  assert.match(service, /req.recitationTransaction.superseded = true/);
  assert.match(server, /if \(!Number\(existingAttempt.isOfficial\)\) return res.status\(409\)/);
  assert.match(server, /RETIRED_RECITATION_ATTEMPT/);
});
