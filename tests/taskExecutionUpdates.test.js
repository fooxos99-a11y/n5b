import test from 'node:test';
import assert from 'node:assert/strict';
import { persistTaskExecutionUpdates } from '../server/services/taskExecutionUpdates.js';

test('200 execution rows use two bounded queries with ownership and teacher guards', async () => {
  const calls = [];
  const updates = Array.from({ length: 200 }, (_, index) => ({
    id: index + 1, status: 'done', page: 2, surah: 2, ayah: 10, executionState: 'complete',
  }));
  await persistTaskExecutionUpdates({ query: async (...args) => calls.push(args) }, updates, 42);
  assert.equal(calls.length, 2);
  for (const [sql, values] of calls) {
    assert.equal((sql.match(/\?/g) || []).length, values.length);
    assert.match(sql, /student_id = \?/);
    assert.match(sql, /teacher_completed IS NULL/);
    assert.match(sql, /execution_actor_role IS NULL OR execution_actor_role = 'student'/);
    assert.equal(values.at(-1), 42);
  }
  assert.equal(calls[0][1][0], 1);
  assert.equal(calls[1][1][0], 101);
});

test('values remain parameters, null boundaries survive, and empty batches do not query', async () => {
  const calls = [];
  const connection = { query: async (...args) => calls.push(args) };
  await persistTaskExecutionUpdates(connection, [], 42);
  assert.equal(calls.length, 0);
  const hostile = "done'; DROP TABLE students; --";
  await persistTaskExecutionUpdates(connection, [{ id: 7, status: hostile, page: null, surah: null, ayah: null, executionState: null }], 42);
  assert.ok(!calls[0][0].includes(hostile));
  assert.deepEqual(calls[0][1], [7, hostile, 7, null, 7, null, 7, null, 7, null, 42, 7, 42]);
});

test('a database failure propagates so the caller can roll back the whole transaction', async () => {
  const failure = new Error('database unavailable');
  await assert.rejects(persistTaskExecutionUpdates({ query: async () => { throw failure; } },
    [{ id: 1, status: 'done', page: 2, surah: 2, ayah: 3, executionState: 'complete' }], 42), failure);
});
