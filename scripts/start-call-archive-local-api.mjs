import { register } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
import { LOCAL_CALL_DATABASE, LOCAL_CALL_PLATFORM_DATABASE, localCallRoot, readLocalCallEnvironment, applyLocalCallEnvironment, isLocalCallApiRequestAllowed, assertLocalCallRegistry } from './call-archive-local-config.mjs';

const command = process.argv[2];

async function preserveExistingDatabases(config) {
  const connection = await mysql.createConnection({ host: config.MYSQL_HOST, port: Number(config.MYSQL_PORT), user: config.MYSQL_USER, password: config.MYSQL_PASSWORD });
  let rows;
  try { [rows] = await connection.query('SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (?,?)', [LOCAL_CALL_DATABASE, LOCAL_CALL_PLATFORM_DATABASE]); }
  finally { await connection.end(); }
  const directory = path.join(localCallRoot, 'backups', 'call-archive-local');
  for (const database of [LOCAL_CALL_DATABASE, LOCAL_CALL_PLATFORM_DATABASE]) {
    if (!rows.some(row => row.name === database)) { console.log(`${database}: fresh isolated schema; no previous data to back up.`); continue; }
    const executable = config.CALL_ARCHIVE_LOCAL_MYSQLDUMP_PATH;
    if (!executable || !path.isAbsolute(executable)) throw new Error('Set absolute CALL_ARCHIVE_LOCAL_MYSQLDUMP_PATH to back up existing local schemas before startup or seeding.');
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${database}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.sql`);
    // Node owns the Unicode output path; MySQL's Windows CLI may not encode it.
    const child = spawn(executable, ['--host=127.0.0.1', '--port=3316', `--user=${config.MYSQL_USER}`, '--single-transaction', '--routines', '--triggers', '--no-tablespaces', '--databases', database],
      { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MYSQL_PWD: config.MYSQL_PASSWORD } });
    await Promise.all([pipeline(child.stdout, createWriteStream(file, { flags: 'wx', mode: 0o600 })), new Promise((resolve, reject) => {
      let diagnostic = '';
      child.stderr.on('data', data => { diagnostic = (diagnostic + data.toString()).slice(-2000); });
      child.on('error', () => reject(new Error('Could not start the local backup executable.')));
      child.on('exit', code => {
        const safeDiagnostic = config.MYSQL_PASSWORD ? diagnostic.replaceAll(config.MYSQL_PASSWORD, '[redacted]') : diagnostic;
        code === 0 ? resolve() : reject(new Error(`Local database backup failed (exit ${code}); no initialization was attempted. ${safeDiagnostic.trim()}`));
      });
    })]);
    console.log(`${database}: independent local backup saved.`);
  }
}

async function seedAccounts(pool, config) {
  const password = config.CALL_ARCHIVE_DEMO_PASSWORD;
  if (typeof password !== 'string' || password.length < 12) throw new Error('Set CALL_ARCHIVE_DEMO_PASSWORD (at least 12 characters) in the explicit local file before seeding.');
  const { hashStudentPassword } = await import('../server/services/studentPassword.js');
  const hash = await hashStudentPassword(password);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const committeeName = 'حلقة اختبار المكالمات المحلي';
    const [committees] = await connection.query('SELECT id FROM committees WHERE name=? LIMIT 2', [committeeName]);
    if (committees.length > 1) throw new Error('The local demo committee is ambiguous; existing data was preserved.');
    let committeeId = committees[0]?.id;
    if (!committeeId) committeeId = (await connection.query('INSERT INTO committees(name) VALUES(?)', [committeeName]))[0].insertId;
    for (const [role, name, login] of [['manager', 'مدير اختبار المكالمات', '990001'], ['reciter', 'مقرئ اختبار المكالمات', '990002'], ['teacher', 'معلم المعاينة المحلية', '990005']]) {
      const [[other]] = await connection.query('SELECT id FROM students WHERE login_number=? LIMIT 1', [login]);
      const [[existing]] = await connection.query('SELECT id,role,name FROM supervisors WHERE login_number=? LIMIT 1', [login]);
      if (other || (existing && (existing.role !== role || existing.name !== name))) throw new Error('A demo login is occupied by a different account; no account was overwritten.');
      let id = existing?.id;
      if (!id) id = (await connection.query("INSERT INTO supervisors(name,login_number,national_id,phone,job_title,role,password_hash) VALUES(?,?,'','','اختبار محلي',?,?)", [name, login, role, hash]))[0].insertId;
      if (role === 'reciter' || (role === 'teacher' && !existing)) await connection.query('INSERT IGNORE INTO supervisor_committees(supervisor_id,committee_id) VALUES(?,?)', [id, committeeId]);
    }
    const [[staff]] = await connection.query("SELECT id FROM supervisors WHERE login_number='990003' LIMIT 1");
    const [[student]] = await connection.query("SELECT id,name FROM students WHERE login_number='990003' LIMIT 1");
    if (staff || (student && student.name !== 'طالب اختبار المكالمات')) throw new Error('The demo student login is occupied; existing data was preserved.');
    if (!student) await connection.query("INSERT INTO students(name,login_number,national_id,guardian_phone,committee_id,password_hash) VALUES('طالب اختبار المكالمات','990003','','',?,?)", [committeeId, hash]);
    await connection.commit();
    console.log('Local demo accounts ready: manager 990001, reciter 990002, student 990003, teacher 990005. Existing passwords are preserved; the password comes from the private local environment file.');
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function main() {
  if (!['--check', '--seed', '--seed-preview', '--serve'].includes(command)) throw new Error('Usage: node scripts/start-call-archive-local-api.mjs --check | --seed | --seed-preview | --serve');
  const config = await readLocalCallEnvironment();
  if (command === '--check') {
    const aiProvider = config.CALL_ARCHIVE_AI_PROVIDER || 'openai';
    console.log(JSON.stringify({ database: LOCAL_CALL_DATABASE, platformDatabase: LOCAL_CALL_PLATFORM_DATABASE, mysqlPort: 3316, api: 'http://127.0.0.1:3037', ui: 'http://127.0.0.1:3038', archiveEnabled: config.CALL_ARCHIVE_ENABLED === 'true', livekitConfigured: Boolean(config.LIVEKIT_URL && config.LIVEKIT_API_KEY && config.LIVEKIT_API_SECRET), aiProvider, aiKeyPresent: Boolean(aiProvider === 'gemini' ? config.GEMINI_API_KEY : config.OPENAI_API_KEY), servicesStarted: false }));
    return;
  }
  if (['--seed', '--seed-preview'].includes(command) && String(config.CALL_ARCHIVE_DEMO_PASSWORD || '').length < 12) throw new Error('Set CALL_ARCHIVE_DEMO_PASSWORD (at least 12 characters) in the explicit local file before seeding.');
  applyLocalCallEnvironment(config);
  register(new URL('./call-archive-local-loader.mjs', import.meta.url), { parentURL: import.meta.url, data: { localCallArchive: true } });
  await preserveExistingDatabases(config);
  const { initDatabase, runWithDatabase } = await import('../server/db.js');
  const pool = await initDatabase(LOCAL_CALL_DATABASE, { seedDefaultData: false });
  if (['--seed', '--seed-preview'].includes(command)) {
    try {
      await seedAccounts(pool, config);
      if (command === '--seed-preview') {
        const { seedLocalCallPreview } = await import('./seed-local-call-preview.mjs');
        await seedLocalCallPreview(pool, config);
      }
    } finally { await pool.end(); }
    return;
  }
  const { initPlatformDatabase, platformDb } = await import('../server/platformDb.js');
  await initPlatformDatabase();
  const assertRegistry = async () => {
    const [rows] = await platformDb().query("SELECT database_name AS databaseName FROM platform_complexes WHERE status='active' AND database_name IS NOT NULL");
    assertLocalCallRegistry(rows);
  };
  await assertRegistry();
  const { localCallArchiveApp } = await import('../server/index.js');
  const { default: express } = await import('express');
  const { startCallArchiveWorker } = await import('../server/services/callArchiveWorker.js');
  const local = express();
  const json = express.json({ limit: '2mb' });
  local.use((req, res, next) => req.path.toLowerCase() === '/api/livekit/webhook' ? next() : json(req, res, next));
  local.use(async (req, res, next) => {
    if (!isLocalCallApiRequestAllowed(req)) return res.status(403).json({ message: 'هذه العملية خارج اختبار المكالمات المحلي.' });
    if (req.path.toLowerCase() === '/api/livekit/webhook') {
      try { await assertRegistry(); }
      catch { return res.status(503).json({ message: 'سجل قواعد الاختبار المحلي غير صالح لاستقبال الحدث.' }); }
    }
    next();
  });
  local.use(localCallArchiveApp);
  local.use((error, _req, res, _next) => res.status(Number(error.status) || 500).json({ message: 'تعذر تنفيذ الطلب المحلي.' }));
  const stop = await runWithDatabase(LOCAL_CALL_DATABASE, { tenant: { registrationNumber: '', name: 'اختبار المكالمات المحلي', databaseName: LOCAL_CALL_DATABASE } }, () => startCallArchiveWorker());
  const server = await new Promise((resolve, reject) => {
    const listener = local.listen(3037, '127.0.0.1', () => resolve(listener));
    listener.on('error', reject);
  });
  let stopping = false;
  const close = async () => {
    if (stopping) return;
    stopping = true; stop();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await pool.end(); await platformDb().end(); process.exit(0);
  };
  process.on('SIGINT', () => { void close(); });
  process.on('SIGTERM', () => { void close(); });
  console.log('Real local calls API listening at http://127.0.0.1:3037. Production auth/routes/providers are unchanged; unrelated startup jobs and integration mutations are disabled.');
}

await main().catch(error => { console.error(error.message); process.exit(1); });
