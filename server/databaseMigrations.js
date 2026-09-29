import crypto from 'node:crypto';
import { readdir } from 'node:fs/promises';

const migrationsDirectory = new URL('./migrations/', import.meta.url);
const migrationFileCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export async function loadDatabaseMigrations() {
  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.js'))
    .sort((left, right) => migrationFileCollator.compare(left, right));
  const migrations = await Promise.all(files.map(async (file) => {
    const migration = await import(new URL(file, migrationsDirectory).href);
    if (!migration.version || typeof migration.up !== 'function') {
      throw new Error(`Database migration ${file} must export version and up.`);
    }
    return {
      file,
      version: String(migration.version),
      up: migration.up,
      down: typeof migration.down === 'function' ? migration.down : null,
    };
  }));
  const versions = new Set();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate database migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }
  return migrations;
}

export async function rollbackLastDatabaseMigration({ pool, databaseName }) {
  const connection = await pool.getConnection();
  const lockName = `nukhab:migrations:${crypto
    .createHash('sha256')
    .update(databaseName)
    .digest('hex')
    .slice(0, 32)}`;
  let lockAcquired = false;
  try {
    const [[lockResult]] = await connection.query('SELECT GET_LOCK(?, 60) AS acquired', [lockName]);
    lockAcquired = Number(lockResult?.acquired) === 1;
    if (!lockAcquired) throw new Error(`Could not acquire migration lock for ${databaseName}.`);
    const migrations = await loadDatabaseMigrations();
    const [appliedRows] = await connection.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.map((row) => String(row.version)));
    const migration = migrations.findLast((candidate) => appliedVersions.has(candidate.version));
    if (!migration) return null;
    if (!migration?.down) {
      throw new Error(`Database migration ${migration.version} does not provide a rollback.`);
    }
    await migration.down(connection);
    await connection.query('DELETE FROM schema_migrations WHERE version = ?', [migration.version]);
    return migration.version;
  } finally {
    if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    connection.release();
  }
}

export async function runPendingDatabaseMigrations({ pool, databaseName }) {
  const connection = await pool.getConnection();
  const lockName = `nukhab:migrations:${crypto
    .createHash('sha256')
    .update(databaseName)
    .digest('hex')
    .slice(0, 32)}`;
  let lockAcquired = false;
  try {
    const [[lockResult]] = await connection.query('SELECT GET_LOCK(?, 60) AS acquired', [lockName]);
    lockAcquired = Number(lockResult?.acquired) === 1;
    if (!lockAcquired) throw new Error(`Could not acquire migration lock for ${databaseName}.`);

    const [appliedRows] = await connection.query('SELECT version FROM schema_migrations');
    const appliedVersions = new Set(appliedRows.map((row) => String(row.version)));
    const migrations = await loadDatabaseMigrations();
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await migration.up(connection);
      await connection.query(
        'INSERT INTO schema_migrations (version) VALUES (?)',
        [migration.version],
      );
    }
  } finally {
    if (lockAcquired) {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    }
    connection.release();
  }
}
