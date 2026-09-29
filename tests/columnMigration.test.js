import test from 'node:test';
import assert from 'node:assert/strict';
import * as productArchive from '../server/migrations/2026.09.02.2-store-product-archive.js';

for (const [migration, table, column, definition] of [
  [productArchive, 'store_products', 'deleted_at', 'TIMESTAMP NULL AFTER is_active'],
]) {
  test(`${migration.version} preserves reversible, idempotent column changes`, async () => {
    let present = false;
    const changes = [];
    const connection = {
      async query(sql, parameters) {
        if (sql.includes('information_schema.columns')) {
          assert.deepEqual(parameters, [table, column]);
          return [[{ count: Number(present) }]];
        }
        changes.push(sql);
        present = sql.includes('ADD COLUMN');
        return [[]];
      },
    };
    await migration.up(connection);
    await migration.up(connection);
    await migration.down(connection);
    await migration.down(connection);
    assert.deepEqual(changes, [
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
      `ALTER TABLE ${table} DROP COLUMN ${column}`,
    ]);
  });
}
