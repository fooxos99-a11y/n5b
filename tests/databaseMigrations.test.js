import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadDatabaseMigrations } from '../server/databaseMigrations.js';

test('database migrations are discovered automatically and applied once under a lock', async () => {
  const [runner, database, migrations] = await Promise.all([
    readFile(new URL('../server/databaseMigrations.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    loadDatabaseMigrations(),
  ]);

  const versions = migrations.map((migration) => migration.version);
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  assert.deepEqual(versions, [...versions].sort((left, right) => collator.compare(left, right)));
  assert.ok(versions.includes('2026.08.15.1'));
  assert.ok(versions.includes('2026.08.17.1'));
  assert.match(runner, /readdir\(migrationsDirectory\)/);
  assert.match(runner, /SELECT GET_LOCK/);
  assert.match(runner, /SELECT version FROM schema_migrations/);
  assert.match(runner, /INSERT INTO schema_migrations \(version\)/);
  assert.match(database, /runPendingDatabaseMigrations\(\{ pool, databaseName \}\)/);
});

test('rankings visibility migration preserves the previous combined preference', async () => {
  const migration = await readFile(
    new URL('../server/migrations/2026.08.17.1-rankings-visibility.js', import.meta.url),
    'utf8',
  );

  assert.match(migration, /studentRankingsVisible/);
  assert.match(migration, /familyRankingsVisible/);
  assert.match(migration, /setting_key = 'rankingsVisible'/);
  assert.match(migration, /INSERT IGNORE/);
});
