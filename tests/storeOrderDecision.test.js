import test from 'node:test';
import assert from 'node:assert/strict';
import { decideStoreOrder } from '../server/services/storeOrderDecision.js';

function fixture({ ranking = 20, stock = 2 } = {}) {
  const order = { studentId: 1, productId: 2, productName: 'منتج', pointsPrice: 30, fulfilledAt: null, rejectedAt: null, stockReserved: stock === null ? 0 : 1 };
  const state = { wallet: 70, stock, points: 80, refunds: 0, order };
  const connection = { async query(sql, args) {
    if (sql.startsWith('SELECT student_id AS studentId FROM store_orders')) return [[{ studentId: 1 }]];
    if (sql.startsWith('SELECT id FROM students')) return [[{ id: 1 }]];
    if (sql.includes('FROM store_orders WHERE id = ? FOR UPDATE')) return [[order]];
    if (sql.startsWith('UPDATE students SET store_balance')) { state.wallet += Number(args[0]); return [{}]; }
    if (sql.startsWith('UPDATE store_products')) { if (state.stock !== null) state.stock++; return [{}]; }
    if (sql.includes('FROM student_point_transactions')) return [[{ points: ranking }]];
    if (sql.startsWith('UPDATE store_orders')) { order[sql.includes('SET rejected_at') ? 'rejectedAt' : 'fulfilledAt'] = 'today'; return [{}]; }
    assert.fail(sql);
  } };
  const decide = (status) => decideStoreOrder(connection, { id: 1, status, date: '2026-09-22', actor: { id: 3, role: 'admin', name: 'مسؤول' }, settings: {},
    applyStudentPointDelta: async (_connection, id, points, _settings, options) => {
      assert.equal(id, 1); assert.equal(options.updateStoreBalance, false); state.points += points;
    },
    logStudentPointTransaction: async (_connection, transaction) => {
      assert.equal(transaction.dedupeKey, 'store_refund:1'); assert.equal(transaction.points, ranking); state.refunds++;
    },
  });
  return { state, decide };
}

test('rejecting releases wallet, stock and only the ranking points actually deducted exactly once', async () => {
  const { state, decide } = fixture();
  await decide('rejected');
  await decide('rejected');
  assert.equal(state.wallet, 100);
  assert.equal(state.stock, 3);
  assert.equal(state.points, 100);
  assert.equal(state.refunds, 1);
  await assert.rejects(decide('accepted'), { statusCode: 409 });
});
test('accepting never double-charges the reserved balance, and decisions cannot be reversed', async () => {
  const { state, decide } = fixture();
  await decide('accepted'); await decide('accepted');
  assert.equal(state.wallet, 70); assert.equal(state.points, 80); assert.equal(state.stock, 2);
  await assert.rejects(decide('rejected'), { statusCode: 409 });
});
test('wallet-only purchases refund no ranking points and retain unlimited stock', async () => {
  const { state, decide } = fixture({ ranking: 0, stock: null });
  await decide('rejected');
  assert.equal(state.wallet, 100); assert.equal(state.stock, null); assert.equal(state.refunds, 0);
  await assert.rejects(decide('invalid'), { statusCode: 422 });
});
