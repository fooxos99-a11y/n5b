import test from 'node:test';
import assert from 'node:assert/strict';
import { singleFlight, refreshableSingleFlight, limitedTaskQueue } from '../src/lib/asyncRequests.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('fresh evaluation bypasses an old transport and its completion cannot evict the fresh request', async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const load = refreshableSingleFlight(() => (++calls === 1 ? first.promise : second.promise), id => id);
  const old = load(1);
  const fresh = load(1, { fresh: true });
  assert.notEqual(old, fresh);
  first.resolve('before save');
  assert.equal(await old, 'before save');
  assert.equal(load(1), fresh);
  second.resolve('after save');
  assert.equal(await fresh, 'after save');
  assert.equal(calls, 2);
});

test('overlapping session loads share one request and retries do not cache results or failures', async () => {
  let calls = 0;
  let response = deferred();
  const load = singleFlight(() => { calls += 1; return response.promise; }, (id) => id);
  const first = load(1);
  assert.equal(load(1), first);
  response.resolve('session');
  assert.equal(await first, 'session');
  assert.equal(calls, 1);
  response = deferred();
  const failure = load(1);
  response.reject(new Error('timeout'));
  await assert.rejects(failure, /timeout/);
  response = deferred();
  const retry = load(1);
  response.resolve('fresh');
  assert.equal(await retry, 'fresh');
  assert.equal(calls, 3);
});

test('single flight isolates different tenant, account and authentication scopes', async () => {
  const calls = [];
  const load = singleFlight(async (...args) => { calls.push(args); return args; }, (...args) => JSON.stringify(args));
  const keys = [['a', 1, 1], ['b', 1, 1], ['a', 2, 1], ['a', 1, 2]];
  const requests = keys.map((key) => load(...key));
  assert.equal(load(...keys[0]), requests[0]);
  assert.deepEqual(await Promise.all(requests), keys);
  assert.deepEqual(calls, keys);
});

test('background task loads share a four-request limit, deduplicate, and continue after failure', async () => {
  const gates = Array.from({ length: 13 }, deferred);
  let running = 0;
  let maximum = 0;
  const calls = [];
  const load = limitedTaskQueue(async (id) => {
    calls.push(id);
    running += 1;
    maximum = Math.max(maximum, running);
    try { return await gates[id].promise; }
    finally { running -= 1; }
  }, (id) => id, 4);
  const requests = gates.map((_, id) => load(id));
  assert.equal(load(7), requests[7]);
  const completed = Promise.allSettled(requests);
  await Promise.resolve();
  assert.deepEqual(calls, [0, 1, 2, 3]);
  gates.forEach((gate, id) => id === 0 ? gate.reject(new Error('network')) : gate.resolve(id));
  const results = await completed;
  assert.equal(maximum, 4);
  assert.equal(calls.length, 13);
  assert.equal(results[0].status, 'rejected');
  assert.ok(results.slice(1).every((result) => result.status === 'fulfilled'));
});
