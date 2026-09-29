import test from 'node:test';
import assert from 'node:assert/strict';
import { up, down } from '../server/migrations/2026.09.09.2-unlimited-store-purchases.js';

test('store migration removes only daily uniqueness, preserves request idempotency, and can run twice', async () => {
  const indexes = new Set(['PRIMARY', 'store_orders_student_daily_unique', 'store_orders_request_unique']);
  const connection = { async query(sql) {
    if (sql === 'SHOW INDEX FROM store_orders') return [[...indexes].map(Key_name => ({ Key_name }))];
    if (sql.includes('ADD INDEX store_orders_student_date')) indexes.add('store_orders_student_date');
    else if (sql.includes('DROP INDEX store_orders_student_daily_unique')) indexes.delete('store_orders_student_daily_unique');
    else assert.fail(`Unexpected migration statement: ${sql}`);
    return [];
  } };
  await up(connection);
  await up(connection);
  assert.deepEqual([...indexes].sort(), ['PRIMARY', 'store_orders_request_unique', 'store_orders_student_date']);
});

test('rollback refuses to remove valid repeated purchases', async () => {
  const calls = [];
  await assert.rejects(down({ query: async (sql) => { calls.push(sql); return [[{ student_id: 1 }]]; } }), /No orders were changed/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('SELECT'));
});
