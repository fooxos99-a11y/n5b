import test from 'node:test';
import assert from 'node:assert/strict';
import { createUndoSqlPlan, maskSqlLiterals, mutationTable } from '../server/services/undoSqlPlan.js';
import { finalChanges } from '../server/services/undoJournal.js';

const meta = { table: 'items', primaryKey: ['id'], uniqueKeys: [['id'], ['name']], autoIncrement: ['id'], nullableDefault: [] };
test('update predicates do not mistake quoted user text for SQL structure', () => {
  const plan = createUndoSqlPlan('UPDATE items SET name = ? WHERE id = ?', ["WHERE id = 4; -- \\\\x27\"", 7], meta);
  assert.equal(plan.selector, 'id = 7');
  assert.equal(plan.kind, 'update');
  assert.equal(maskSqlLiterals("'WHERE' WHERE"), '        WHERE');
});
test('bulk inserts and upserts select old conflicting rows by their unique keys', () => {
  const plan = createUndoSqlPlan('INSERT INTO items (name, value) VALUES (?, ?), (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['one', 2, 'two', 3], meta);
  assert.equal(plan.kind, 'insert');
  assert.match(plan.selector, /`name` <=> 'one'/);
  assert.match(plan.selector, /`name` <=> 'two'/);
  assert.doesNotMatch(plan.selector, /`value`/);
});
test('unsafe partial captures fail closed for joins, changed keys, subqueries and multi-statements', () => {
  for (const sql of [
    'UPDATE items i JOIN other o ON o.id = i.id SET i.name = 2 WHERE i.id = 1',
    'UPDATE items SET id = 9 WHERE id = 1',
    'DELETE FROM items WHERE id IN (SELECT id FROM other)',
    'DELETE FROM items; DELETE FROM other',
    'INSERT INTO items (name) VALUES (CURRENT_USER())',
    "INSERT INTO items (name) VALUES ('x') ON DUPLICATE KEY UPDATE id = 22",
    "INSERT INTO items (value) VALUES (2) ON DUPLICATE KEY UPDATE value = 3",
  ]) assert.throws(() => createUndoSqlPlan(sql, [], meta), Error, sql);
});
test('table identifiers cannot include caller-selected schema or SQL fragments', () => {
  assert.equal(mutationTable(' UPDATE `items` SET value = 2 WHERE id=1'), 'items');
  assert.equal(mutationTable('DELETE FROM outside.items WHERE id=1'), null);
  assert.equal(mutationTable('SELECT * FROM items'), null);
});
test('journal composition refuses an intervening write to the same row', () => {
  const change = { key: 'items:1', meta, before: { id: 1, value: 0 }, after: { id: 1, value: 1 } };
  const next = { ...change, before: { id: 1, value: 1 }, after: { id: 1, value: 2 } };
  assert.deepEqual(finalChanges([[change], [next]])[0], { ...change, after: next.after });
  assert.throws(() => finalChanges([[change], [{ ...next, before: { id: 1, value: 9 } }]]), /Concurrent modification/);
});

test('insert constants preserve decimal, exponent, hex, boolean, null and quoted values', () => {
  for (const value of ['NULL', 'true', 'FALSE', '+12', '-1.25', '2e-3', '0xAf', "'WHERE, -- ;'"]) {
    const plan = createUndoSqlPlan(`INSERT INTO items (name) VALUES (${value})`, [], meta);
    assert.equal(plan.kind, 'insert');
    assert.ok(plan.selector.includes(value));
  }
  for (const value of ['1 + 2', '1e', '0x', 'CURRENT_USER()', '(SELECT 1)']) {
    assert.throws(() => createUndoSqlPlan(`INSERT INTO items (name) VALUES (${value})`, [], meta));
  }
});

test('mutation table parsing preserves verb and identifier boundaries', () => {
  for (const sql of ['update Items_2 set value=1', 'DELETE FROM `Items_2` WHERE id=1', 'INSERT IGNORE INTO Items_2(name) VALUES (1)']) {
    assert.equal(mutationTable(sql), 'Items_2');
  }
  for (const sql of ['UPDATEitems SET value=1', 'DELETE FROM outside.items WHERE id=1', 'INSERT INTO 2items(name) VALUES (1)', 'REPLACE INTO items(name) VALUES (1)']) {
    assert.equal(mutationTable(sql), null);
  }
});
