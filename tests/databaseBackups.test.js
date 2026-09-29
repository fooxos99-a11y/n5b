import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { scheduledBackupTiers, expiredBackupRows } from '../server/services/databaseBackups.js';

test('scheduled backups reuse one file across weekly, monthly, and yearly tiers', () => {
  assert.deepEqual(scheduledBackupTiers('2026-08-14'), ['weekly']);
  assert.deepEqual(scheduledBackupTiers('2026-05-01'), ['weekly', 'monthly']);
  assert.deepEqual(scheduledBackupTiers('2027-01-01'), ['weekly', 'monthly', 'yearly']);
  assert.deepEqual(scheduledBackupTiers('2026-08-10'), []);
});

test('database backups are always scheduled, compressed, tenant-scoped, and locked', async () => {
  const [service, routes, database, server] = await Promise.all([
    readFile(new URL('../server/services/databaseBackups.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/backupRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  assert.match(service, /getDatabaseContext\(\)\.databaseName/);
  assert.match(service, /enabled: true/);
  assert.match(service, /pipeline\(dump\.stdout, createGzip/);
  assert.match(service, /\.sql\.gz/);
  assert.doesNotMatch(service, /BACKUP_ENCRYPTION_KEY|createCipheriv|EncryptBackupTransform/);
  assert.match(service, /MYSQL_PWD: process\.env\.MYSQL_PASSWORD/);
  assert.doesNotMatch(service, /--password/);
  assert.match(service, /SELECT GET_LOCK\(\?, 0\)/);
  assert.match(service, /PutObjectCommand/);
  assert.match(service, /BACKUP_RETENTION_COUNT = 2/);
  assert.match(service, /expiredBackupRows\(rows\)/);
  assert.match(service, /restoreCompressedDump\(selected\.filePath, temporaryDatabase\)/);
  assert.match(service, /DELETE FROM auth_sessions/);
  assert.match(routes, /router\.use\(requireManager\)/);
  assert.match(routes, /router\.post\('\/:id\/restore'/);
  assert.doesNotMatch(routes, /router\.put\('\/config'/);
  assert.match(database, /CREATE TABLE IF NOT EXISTS backup_runs/);
  assert.match(server, /path\.startsWith\('\/backups'\).*\['settings'\]/);
  assert.match(server, /runScheduledDatabaseBackup\(getSaudiDateTimeParts\(\)\)/);
  assert.match(service, /const isInitialBackup = !latestSuccessful/);
  assert.match(service, /now\.time\.slice\(0, 5\) < config\.time/);
  assert.match(service, /DATE_SUB\(NOW\(\), INTERVAL 15 MINUTE\)/);
});

test('automatic backups stay server-side and are removed from the browser UI', async () => {
  const [settings, dashboard, api] = await Promise.all([
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(settings, /BackupSettingsPanel|canManageBackups|النسخ الاحتياطي/);
  assert.doesNotMatch(dashboard, /canManageBackups/);
  assert.doesNotMatch(api, /getBackups|createBackup|downloadBackup|restoreBackup/);
});


test('routine backups retain independent safety copies from term closure', () => {
  const rows = [{id:6},{id:5},{id:4},{id:3,retentionTiers:'["safety"]'},{id:2,retentionTiers:['safety']},{id:1,retentionTiers:['safety']}];
  assert.deepEqual(expiredBackupRows(rows).map(row => row.id), [4,1]);
});
