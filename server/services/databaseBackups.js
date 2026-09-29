import crypto from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { db, getDatabaseContext } from '../db.js';

const DEFAULT_TIME = '03:00';
export const BACKUP_RETENTION_COUNT = 2;
const BACKUP_SETTING_KEYS = [
  'backupRemoteEnabled',
];

function backupError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

const booleanValue = (value) => value === true || value === 'true' || value === '1';

function backupRoot() {
  return nodePath.resolve(process.env.BACKUP_DIRECTORY || nodePath.join(process.cwd(), 'backups'));
}

function databaseBackupDirectory(databaseName) {
  if (!/^\w+$/.test(databaseName)) throw new Error('اسم قاعدة البيانات غير صالح للنسخ الاحتياطي.');
  return nodePath.join(backupRoot(), databaseName);
}

async function loadBackupSettingRows() {
  const [rows] = await db().query(
    `SELECT setting_key AS settingKey, setting_value AS settingValue
     FROM app_settings WHERE setting_key IN (?)`,
    [BACKUP_SETTING_KEYS],
  );
  return Object.fromEntries(rows.map((row) => [row.settingKey, row.settingValue]));
}

export async function getBackupConfig() {
  const values = await loadBackupSettingRows();
  return {
    enabled: true,
    time: DEFAULT_TIME,
    retention: { latest: BACKUP_RETENTION_COUNT },
    remoteEnabled: booleanValue(values.backupRemoteEnabled),
    remoteConfigured: Boolean(
      process.env.BACKUP_S3_BUCKET
      && process.env.BACKUP_S3_ENDPOINT
      && process.env.BACKUP_S3_ACCESS_KEY_ID
      && process.env.BACKUP_S3_SECRET_ACCESS_KEY
    ),
  };
}

async function createCompressedDump(databaseName, targetPath) {
  const dump = spawn(process.env.MYSQLDUMP_BINARY || 'mysqldump', [
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--events',
    '--hex-blob',
    '--no-tablespaces',
    '--default-character-set=utf8mb4',
    '--host', process.env.MYSQL_HOST || '127.0.0.1',
    '--port', String(process.env.MYSQL_PORT || 3306),
    '--user', process.env.MYSQL_USER || 'root',
    databaseName,
  ], {
    env: { ...process.env, MYSQL_PWD: process.env.MYSQL_PASSWORD || '' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  dump.stderr.setEncoding('utf8');
  dump.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
  const exit = new Promise((resolve, reject) => {
    dump.once('error', reject);
    dump.once('close', (code) => code === 0
      ? resolve()
      : reject(new Error(stderr.trim() || `mysqldump exited with code ${code}`)));
  });
  try {
    await Promise.all([
      pipeline(dump.stdout, createGzip({ level: 9 }), createWriteStream(targetPath, { flags: 'wx' }))
        .catch((error) => { dump.kill(); throw error; }),
      exit,
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') throw backupError('أداة mysqldump غير مثبتة أو مسارها غير صحيح على الخادم.');
    console.error('Database dump failed:', error.message);
    throw backupError('تعذر إنشاء تفريغ قاعدة البيانات. تحقق من أداة mysqldump وصلاحيات مستخدم قاعدة البيانات.');
  }
}

async function restoreCompressedDump(filePath, databaseName) {
  const mysql = spawn(process.env.MYSQL_BINARY || 'mysql', [
    '--default-character-set=utf8mb4',
    '--host', process.env.MYSQL_HOST || '127.0.0.1',
    '--port', String(process.env.MYSQL_PORT || 3306),
    '--user', process.env.MYSQL_USER || 'root',
    databaseName,
  ], {
    env: { ...process.env, MYSQL_PWD: process.env.MYSQL_PASSWORD || '' },
    windowsHide: true,
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let stderr = '';
  mysql.stderr.setEncoding('utf8');
  mysql.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
  const exit = new Promise((resolve, reject) => {
    mysql.once('error', reject);
    mysql.once('close', (code) => code === 0
      ? resolve()
      : reject(new Error(stderr.trim() || `mysql exited with code ${code}`)));
  });
  try {
    await Promise.all([
      pipeline(createReadStream(filePath), createGunzip(), mysql.stdin)
        .catch((error) => { mysql.kill(); throw error; }),
      exit,
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') throw backupError('أداة mysql غير مثبتة أو مسارها غير صحيح على الخادم.');
    console.error('Database restore failed:', error.message);
    throw backupError('تعذر استعادة النسخة الاحتياطية.');
  }
}

const quoteIdentifier = (value) => `\`${String(value).replaceAll('`', '``')}\``;

async function clearDatabase(connection, databaseName) {
  const [objects] = await connection.query(
    `SELECT TABLE_NAME AS tableName, TABLE_TYPE AS tableType
     FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?`,
    [databaseName],
  );
  const views = objects.filter(({ tableType }) => tableType === 'VIEW');
  const tables = objects.filter(({ tableType }) => tableType === 'BASE TABLE');
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const view of views) {
      await connection.query(`DROP VIEW IF EXISTS ${quoteIdentifier(databaseName)}.${quoteIdentifier(view.tableName)}`);
    }
    for (const table of tables) {
      await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(databaseName)}.${quoteIdentifier(table.tableName)}`);
    }
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function ensureBackupMetadataSchema(connection, databaseName) {
  const [[column]] = await connection.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'backup_runs' AND COLUMN_NAME = 'retention_tiers'`,
    [databaseName],
  );
  if (!Number(column?.count)) {
    await connection.query('ALTER TABLE backup_runs ADD COLUMN retention_tiers JSON NULL AFTER storage_targets');
  }
}

async function recordSafetyBackup(connection, safety, actorName) {
  await connection.query(
    `INSERT INTO backup_runs
      (status, trigger_type, actor_name, file_name, size_bytes, checksum_sha256,
       storage_targets, retention_tiers, completed_at)
     VALUES ('completed', 'manual', ?, ?, ?, ?, ?, ?, NOW())`,
    [
      `نسخة طوارئ قبل الاستعادة - ${String(actorName).slice(0, 120)}`,
      safety.fileName,
      safety.sizeBytes,
      safety.checksum,
      JSON.stringify(safety.storageTargets),
      JSON.stringify(['safety']),
    ],
  );
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function createS3Client() {
  return new S3Client({
    region: process.env.BACKUP_S3_REGION || 'auto',
    endpoint: process.env.BACKUP_S3_ENDPOINT,
    forcePathStyle: booleanValue(process.env.BACKUP_S3_FORCE_PATH_STYLE),
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadRemote(filePath, objectKey, tiers) {
  const client = createS3Client();
  try {
    const stat = await fs.stat(filePath);
    await client.send(new PutObjectCommand({
      Bucket: process.env.BACKUP_S3_BUCKET,
      Key: objectKey,
      Body: createReadStream(filePath),
      ContentLength: stat.size,
      ContentType: 'application/gzip',
      Metadata: { compressed: 'gzip', retention: tiers.join(',') },
    }));
  } finally {
    client.destroy();
  }
}

async function deleteRemote(objectKey) {
  const client = createS3Client();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Key: objectKey }));
  } finally {
    client.destroy();
  }
}

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeTiers = (tiers, trigger) => {
  const allowed = new Set(['weekly', 'monthly', 'yearly', 'safety', 'manual']);
  const normalized = [...new Set((Array.isArray(tiers) ? tiers : []).filter((tier) => allowed.has(tier)))];
  return normalized.length ? normalized : [trigger === 'scheduled' ? 'weekly' : 'manual'];
};

/** Safety copies have their own retention so routine backups cannot evict the pre-closure copy. */
export function expiredBackupRows(rows) {
  let regular = 0;
  let safety = 0;
  return rows.filter(row => parseJsonArray(row.retentionTiers).includes('safety')
    ? ++safety > BACKUP_RETENTION_COUNT : ++regular > BACKUP_RETENTION_COUNT);
}

async function applyRetention(databaseName) {
  const [rows] = await db().query(
    `SELECT id, file_name AS fileName, storage_targets AS storageTargets,
      retention_tiers AS retentionTiers
     FROM backup_runs
     WHERE status = 'completed' AND file_name IS NOT NULL
     ORDER BY completed_at DESC, id DESC`,
  );
  const expired = expiredBackupRows(rows).map(row => ({ ...row, storageTargets: parseJsonArray(row.storageTargets) }));

  const directory = databaseBackupDirectory(databaseName);
  const remoteConfigured = Boolean(
    process.env.BACKUP_S3_BUCKET
    && process.env.BACKUP_S3_ENDPOINT
    && process.env.BACKUP_S3_ACCESS_KEY_ID
    && process.env.BACKUP_S3_SECRET_ACCESS_KEY
  );
  for (const row of expired) {
    if (!row.fileName || nodePath.basename(row.fileName) !== row.fileName) continue;
    await fs.unlink(nodePath.join(directory, row.fileName)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    if (remoteConfigured && row.storageTargets.includes('remote')) {
      await deleteRemote(`${databaseName}/${row.fileName}`);
    }
    await db().query('DELETE FROM backup_runs WHERE id = ?', [row.id]);
  }
}

export async function createDatabaseBackup({
  trigger = 'manual',
  actorName = 'النظام',
  tiers,
  skipRetention = false,
} = {}) {
  const databaseName = getDatabaseContext().databaseName;
  const config = await getBackupConfig();
  const retentionTiers = normalizeTiers(tiers, trigger);
  if (config.remoteEnabled && !config.remoteConfigured) {
    throw backupError('التخزين الخارجي مفعّل لكن إعدادات S3/R2 غير مكتملة.');
  }

  const connection = await db().getConnection();
  const lockName = `nukhab:backup:${crypto.createHash('sha256').update(databaseName).digest('hex').slice(0, 32)}`;
  let lockAcquired = false;
  let runId;
  let filePath;
  try {
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    lockAcquired = Number(lock?.acquired) === 1;
    if (!lockAcquired) throw backupError('يوجد نسخ احتياطي قيد التنفيذ حاليًا.', 409);
    const [result] = await connection.query(
      `INSERT INTO backup_runs (status, trigger_type, actor_name, retention_tiers)
       VALUES ('running', ?, ?, ?)`,
      [trigger, String(actorName || 'النظام').slice(0, 160), JSON.stringify(retentionTiers)],
    );
    runId = Number(result.insertId);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${databaseName}-${stamp}.sql.gz`;
    const directory = databaseBackupDirectory(databaseName);
    filePath = nodePath.join(directory, fileName);
    await fs.mkdir(directory, { recursive: true });
    await createCompressedDump(databaseName, filePath);
    const stat = await fs.stat(filePath);
    const checksum = await sha256File(filePath);
    const targets = ['local'];
    if (config.remoteEnabled) {
      await uploadRemote(filePath, `${databaseName}/${fileName}`, retentionTiers);
      targets.push('remote');
    }
    await connection.query(
      `UPDATE backup_runs SET status = 'completed', file_name = ?, size_bytes = ?,
       checksum_sha256 = ?, storage_targets = ?, completed_at = NOW() WHERE id = ?`,
      [fileName, stat.size, checksum, JSON.stringify(targets), runId],
    );
    if (!skipRetention) await applyRetention(databaseName);
    return {
      id: String(runId),
      status: 'completed',
      fileName,
      sizeBytes: stat.size,
      checksum,
      storageTargets: targets,
      retentionTiers,
    };
  } catch (error) {
    const publicError = error.statusCode
      ? error
      : backupError('تعذر إكمال النسخة الاحتياطية. راجع إعدادات التخزين وسجل الخادم.');
    if (!error.statusCode) console.error('Database backup failed:', error.message);
    if (filePath) await fs.unlink(filePath).catch(() => {});
    if (runId) {
      await connection.query(
        `UPDATE backup_runs SET status = 'failed', error_message = ?, completed_at = NOW() WHERE id = ?`,
        [publicError.message, runId],
      ).catch(() => {});
    }
    throw publicError;
  } finally {
    if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    connection.release();
  }
}

export async function listDatabaseBackups(limit = 30) {
  const [rows] = await db().query(
    `SELECT id, status, trigger_type AS triggerType, actor_name AS actorName,
      file_name AS fileName, size_bytes AS sizeBytes, checksum_sha256 AS checksum,
      storage_targets AS storageTargets, retention_tiers AS retentionTiers,
      error_message AS errorMessage,
      DATE_FORMAT(started_at, '%Y-%m-%d %H:%i') AS startedAt,
      DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i') AS completedAt
     FROM backup_runs ORDER BY id DESC LIMIT ?`,
    [Math.min(100, Math.max(1, Number(limit) || 30))],
  );
  return rows.map((row) => ({
    ...row,
    id: String(row.id),
    sizeBytes: Number(row.sizeBytes || 0),
    storageTargets: Array.isArray(row.storageTargets)
      ? row.storageTargets
      : (() => { try { return JSON.parse(row.storageTargets || '[]'); } catch { return []; } })(),
    retentionTiers: normalizeTiers(parseJsonArray(row.retentionTiers), row.triggerType),
  }));
}

export async function resolveBackupDownload(runId) {
  const [[run]] = await db().query(
    `SELECT file_name AS fileName FROM backup_runs
     WHERE id = ? AND status = 'completed' LIMIT 1`,
    [runId],
  );
  if (!run?.fileName || nodePath.basename(run.fileName) !== run.fileName) return null;
  const databaseName = getDatabaseContext().databaseName;
  const filePath = nodePath.join(databaseBackupDirectory(databaseName), run.fileName);
  const stat = await fs.stat(filePath).catch(() => null);
  return stat?.isFile() ? { filePath, fileName: run.fileName } : null;
}

async function resolveBackupForRestore(runId) {
  const [[run]] = await db().query(
    `SELECT file_name AS fileName, checksum_sha256 AS checksum
     FROM backup_runs WHERE id = ? AND status = 'completed' LIMIT 1`,
    [runId],
  );
  if (!run?.fileName || nodePath.basename(run.fileName) !== run.fileName) return null;
  const databaseName = getDatabaseContext().databaseName;
  const filePath = nodePath.join(databaseBackupDirectory(databaseName), run.fileName);
  const stat = await fs.stat(filePath).catch(() => null);
  return stat?.isFile() ? { ...run, filePath, databaseName } : null;
}

export async function restoreDatabaseBackup(runId, actorName = 'المدير') {
  const selected = await resolveBackupForRestore(runId);
  if (!selected) throw backupError('النسخة الاحتياطية غير موجودة.', 404);
  const actualChecksum = await sha256File(selected.filePath);
  assertBackupChecksum(selected, actualChecksum);

  const safety = await createDatabaseBackup({
    trigger: 'manual',
    actorName: `قبل الاستعادة - ${actorName}`,
    tiers: ['safety'],
    skipRetention: true,
  });
  const safetyPath = nodePath.join(databaseBackupDirectory(selected.databaseName), safety.fileName);
  const connection = await db().getConnection();
  const lockName = `nukhab:backup:${crypto.createHash('sha256').update(selected.databaseName).digest('hex').slice(0, 32)}`;
  const temporaryDatabase = `${selected.databaseName.slice(0, 36)}_restore_${Date.now()}`;
  let lockAcquired = false;
  let liveRestoreStarted = false;
  try {
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    lockAcquired = Number(lock?.acquired) === 1;
    if (!lockAcquired) throw backupError('توجد عملية نسخ أو استعادة قيد التنفيذ حاليًا.', 409);

    await connection.query(`CREATE DATABASE \`${temporaryDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await validateRestoredBackupTables(selected, temporaryDatabase, connection);

    liveRestoreStarted = true;
    await clearDatabase(connection, selected.databaseName);
    await restoreCompressedDump(selected.filePath, selected.databaseName);
    await ensureBackupMetadataSchema(connection, selected.databaseName);
    await connection.query('DELETE FROM auth_sessions');
    await recordSafetyBackup(connection, safety, actorName);
    await applyRetention(selected.databaseName);
    return { restored: true, safetyBackupCreated: true };
  } catch (error) {
    let rollbackSucceeded = false;
    rollbackSucceeded = await rollbackFailedDatabaseRestore({ liveRestoreStarted, connection, selected, safetyPath, safety, actorName, rollbackSucceeded });
    if (liveRestoreStarted && rollbackSucceeded) {
      throw backupError('تعذرت الاستعادة وأعيدت البيانات إلى نسخة الطوارئ.', 503);
    }
    if (liveRestoreStarted) {
      throw backupError('تعذرت الاستعادة وكذلك العودة إلى نسخة الطوارئ. يلزم تدخل فني فورًا.', 503);
    }
    if (error.statusCode) throw error;
    console.error('Database restore operation failed:', error.message);
    await applyRetention(selected.databaseName).catch(() => {});
    throw backupError('تعذرت الاستعادة ولم تُغيّر البيانات الحالية.', 503);
  } finally {
    await connection.query(`DROP DATABASE IF EXISTS \`${temporaryDatabase}\``).catch(() => {});
    if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    connection.release();
  }
}

/** Attempt the safety restore after a failed live restore and report whether recovery succeeded. */
async function rollbackFailedDatabaseRestore({ liveRestoreStarted, connection, selected, safetyPath, safety, actorName, rollbackSucceeded }) {
  if (liveRestoreStarted) {
    try {
      await clearDatabase(connection, selected.databaseName);
      await restoreCompressedDump(safetyPath, selected.databaseName);
      await ensureBackupMetadataSchema(connection, selected.databaseName);
      await connection.query('DELETE FROM auth_sessions');
      await recordSafetyBackup(connection, safety, actorName);
      rollbackSucceeded = true;
      await applyRetention(selected.databaseName).catch((retentionError) => {
        console.error('Backup retention after rollback failed:', retentionError.message);
      });
    } catch (rollbackError) {
      console.error('Database restore rollback failed:', rollbackError.message);
    }
  }
  return rollbackSucceeded;
}

/** Reject missing or mismatched checksums before creating a safety backup or touching live tables. */
function assertBackupChecksum(selected, actualChecksum) {
  if (!selected.checksum || actualChecksum !== selected.checksum) {
    throw backupError('فشل التحقق من سلامة النسخة الاحتياطية.', 409);
  }
}

/** Verify the dump in the temporary schema before the caller starts restoring the live database. */
async function validateRestoredBackupTables(selected, temporaryDatabase, connection) {
  try {
    await restoreCompressedDump(selected.filePath, temporaryDatabase);
    const [[validation]] = await connection.query(
      'SELECT COUNT(*) AS tableCount FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?',
      [temporaryDatabase]
    );
    if (!Number(validation?.tableCount)) throw backupError('النسخة الاحتياطية لا تحتوي على جداول قابلة للاستعادة.', 409);
  } finally {
    await connection.query(`DROP DATABASE IF EXISTS \`${temporaryDatabase}\``).catch(() => { });
  }
}

export function scheduledBackupTiers(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!match) return [];
  const [, , month, day] = match;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const tiers = [];
  if (weekday === 5) tiers.push('weekly');
  if (day === '01') tiers.push('monthly');
  if (month === '01' && day === '01') tiers.push('yearly');
  return tiers;
}

export async function runScheduledDatabaseBackup(now) {
  const config = await getBackupConfig();
  const [[latestSuccessful]] = await db().query(
    "SELECT id FROM backup_runs WHERE status = 'completed' LIMIT 1",
  );
  const scheduledTiers = scheduledBackupTiers(now.date);
  const isInitialBackup = !latestSuccessful;
  if (!isInitialBackup && (now.time.slice(0, 5) < config.time || !scheduledTiers.length)) return false;
  const tiers = scheduledTiers.length ? scheduledTiers : ['weekly'];
  const [[lastRun]] = await db().query(
    `SELECT id FROM backup_runs
     WHERE trigger_type = 'scheduled' AND DATE(started_at) = ?
       AND (status IN ('completed', 'running')
         OR started_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE))
     LIMIT 1`,
    [now.date],
  );
  if (lastRun) return false;
  await createDatabaseBackup({ trigger: 'scheduled', actorName: 'النظام', tiers });
  return true;
}
