import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredActions, UNDO_WINDOW_MS } from '../src/lib/deferredActions.js';

function fixture() {
  const timers = new Map();
  let sequence = 0;
  let time = 100;
  return { timers, setTime: value => { time = value; }, queue: createDeferredActions({
    now: () => time,
    schedule: (callback, ms) => { assert.equal(ms, UNDO_WINDOW_MS); timers.set(++sequence, callback); return sequence; },
    clear: id => timers.delete(id),
  }) };
}

test('completed actions offer independent undo windows without blocking new work', async () => {
  const { queue, timers } = fixture();
  const reversed = [];
  const first = queue.register('first', async () => { reversed.push('first'); });
  const second = queue.register('second', async () => { reversed.push('second'); });
  assert.equal(queue.getSnapshot().length, 2);
  assert.equal(queue.getSnapshot()[0].expiresAt, 10_100);
  const expire = timers.get(1);
  assert.equal(await queue.cancel(first), true);
  expire();
  assert.equal(await queue.cancel(first), false);
  assert.deepEqual(reversed, ['first']);
  assert.equal(queue.getSnapshot()[0].id, second);
});

test('expiry and leaving the dashboard never cancel completed writes', async () => {
  const { queue, timers, setTime } = fixture();
  let reversed = 0;
  const id = queue.register('saved', () => { reversed++; });
  setTime(10_100);
  assert.equal(await queue.cancel(id), false);
  const second = queue.register('saved', () => { reversed++; });
  timers.get(second)();
  queue.register('saved', () => { reversed++; });
  queue.cancelAll();
  assert.equal(reversed, 0);
  assert.equal(queue.getSnapshot().length, 0);
});

test('only the selected undo is busy and duplicate clicks cannot reverse twice', async () => {
  const { queue } = fixture();
  let finish;
  const id = queue.register('saved', () => new Promise(resolve => { finish = resolve; }));
  queue.register('other', async () => {});
  const undo = queue.cancel(id);
  assert.equal(queue.getSnapshot()[0].busy, true);
  assert.equal(queue.getSnapshot()[1].busy, false);
  assert.equal(await queue.cancel(id), false);
  finish();
  assert.equal(await undo, true);
});

test('a server conflict is reported and never treated as successful undo', async () => {
  const { queue } = fixture();
  const id = queue.register('saved', async () => { throw new Error('conflict'); });
  await assert.rejects(queue.cancel(id), /conflict/);
  assert.equal(queue.getSnapshot().length, 0);
});
