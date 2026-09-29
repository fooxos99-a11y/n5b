import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { createDatabaseBackup, restoreDatabaseBackup } from '../server/services/databaseBackups.js';
assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST || '127.0.0.1'));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const name = `nukhab_audit_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const directory = await mkdtemp(join(tmpdir(), 'nukhab-backup-test-'));
process.env.BACKUP_DIRECTORY = directory;
process.env.MYSQLDUMP_BINARY ||= 'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe';
process.env.MYSQL_BINARY ||= 'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysql.exe';
let pool;
try {
  pool = await initDatabase(name, { seedDefaultData: false });
  await runWithDatabase(name, {}, async () => {
    await pool.query("INSERT INTO app_settings (setting_key,setting_value) VALUES ('audit_marker','before closure')");
    const backup = await createDatabaseBackup({actorName:'Local isolated test',tiers:['safety'],skipRetention:true});
    await pool.query("UPDATE app_settings SET setting_value='after closure' WHERE setting_key='audit_marker'");
    assert.equal((await restoreDatabaseBackup(backup.id, 'Local isolated test')).restored, true);
    const [[row]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='audit_marker'");
    assert.equal(row.setting_value, 'before closure');
    globalThis.console.log('Isolated MySQL backup, checksum, safety copy and restore passed.');
  });
} finally {
  await pool?.end();
  const admin = await mysql.createConnection({host:process.env.MYSQL_HOST || '127.0.0.1',port:Number(process.env.MYSQL_PORT || 3306),user:process.env.MYSQL_USER || 'root',password:process.env.MYSQL_PASSWORD || ''});
  try { assert.match(name,/^nukhab_audit_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); } finally { await admin.end(); }
  await rm(directory, {recursive:true,force:true});
}
