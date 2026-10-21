import assert from 'node:assert/strict';
import { register } from 'node:module';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import process from 'node:process';
import { URL } from 'node:url';

export async function createPassingGuestFixture(database) {
  assert.equal(process.env.MYSQL_HOST, '127.0.0.1');
  assert.match(database, /^nukhab_guest_(?:test_[a-f0-9]{16}|preview_\d{8})$/);
  process.env.MYSQL_DATABASE = database;
  process.env.SITE_KEY = 'nukhab';
  process.env.SITE_REGISTRATION_NUMBER = 'passing-local-preview';
  process.env.SEED_DEFAULT_DATA = 'false';
  process.env.CALL_ARCHIVE_ENABLED = 'false';
  process.env.PUBLIC_APP_URL = 'http://127.0.0.1:3048';
  process.env.PLATFORM_PUBLIC_APP_URL = process.env.PUBLIC_APP_URL;
  process.env.NODE_ENV = 'test';
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try {
    const [existing] = await connection.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?', [database]);
    assert.equal(existing.length, 0, 'Fixture refuses to migrate or overwrite an existing database');
  } finally { await connection.end(); }
  register(new URL('../fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
  const { initDatabase, runWithDatabase } = await import('../../server/db.js');
  const { createAuthSession } = await import('../../server/services/authSessions.js');
  const { PASSING_LINK_KEY, passingTokenHash } = await import('../../server/services/passingGuest.js');
  const { readQuranRange } = await import('../../server/services/quranReferenceCache.js');
  const { getBusinessDate, shiftDateOnly } = await import('../../shared/business-date.js');
  const pool = await initDatabase(database, { seedDefaultData: false });
  const { app } = await import('../../server/index.js');
  const date = shiftDateOnly(getBusinessDate(), -30);
  await pool.query("INSERT INTO complexes(id,name) VALUES(1,'المجمع المحلي الأول'),(2,'المجمع المحلي الثاني')");
  await pool.query("INSERT INTO committees(id,name,complex_id) VALUES(1,'الحلقة المحلية الأولى',1),(2,'الحلقة المحلية الثانية',2),(3,'الحلقة المحلية الثالثة',1)");
  for (const [id, role, name] of [[1, 'manager', 'الإدارة المحلية'], [2, 'admin', 'إداري الاجتياز'], [3, 'admin', 'إداري آخر'], [4, 'supervisor', 'مشرف الحلقة']]) {
    await pool.query(`INSERT INTO supervisors(id,name,role,login_number,national_id,phone,job_title,password_hash)
      VALUES(?,?,?,?,'','','','fixture-only-hash')`, [id, name, role, `local-passing-${id}`]);
  }
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(2,'quranPassing'),(3,'settings'),(4,'quranPassing')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(4,1)');
  const ayahs = await readQuranRange(pool, 1, 604);
  for (const [id, name, committee, parts] of [[11, 'طالب الاجتياز المحلي', 1, [1, 2]], [12, 'طالب المجمع الثاني', 2, [30]], [13, 'طالب دون أجزاء مكتملة', 3, []]]) {
    await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id) VALUES(?,?,?,'','',?)", [id, name, `local-student-${id}`, committee]);
    await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status) VALUES(?,?,?,1,604,1,1,114,6,1,1,'active')`, [id, id, date]);
    for (const juz of parts) {
      const items = ayahs.filter(row => row.juz === juz), first = items[0], last = items.at(-1);
      await pool.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,teacher_completed,student_status)
        VALUES(?,?,?,'memorization',?,?,?,?,?,?,1,'done')`, [id, id, shiftDateOnly(date, juz), first.page, last.page, first.surah, first.ayah, last.surah, last.ayah]);
    }
  }
  const linkToken = randomBytes(32).toString('hex');
  await pool.query('INSERT INTO app_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [PASSING_LINK_KEY, passingTokenHash(linkToken)]);
  const staffTokens = await runWithDatabase(database, {}, async () => ({
    manager: await createAuthSession('manager', 1, 'الإدارة المحلية'),
    admin: await createAuthSession('admin', 2, 'إداري الاجتياز'),
    otherAdmin: await createAuthSession('admin', 3, 'إداري آخر'),
    supervisor: await createAuthSession('supervisor', 4, 'مشرف الحلقة'),
  }));
  return { pool, app, linkToken, staffTokens, runWithDatabase };
}
