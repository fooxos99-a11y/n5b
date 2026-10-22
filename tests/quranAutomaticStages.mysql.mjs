import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import { activateQueuedQuranPlan } from '../server/services/quranPlanQueue.js';
import { resolveAutomaticRange } from '../shared/quran-automatic-plan.js';

assert.equal(process.env.MYSQL_HOST, '127.0.0.1');
assert.equal(process.env.MYSQL_PORT, '3310');
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3310,
  database: 'nukhab_local', user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '' });
const tables = ['student_quran_plans', 'student_quran_tasks', 'student_quran_prior_memorization', 'student_quran_plan_prior_memorization'];
const scoped = { query: (sql, values) => connection.query(tables.reduce((text, table) => text.replaceAll(new RegExp(`\\b${table}\\b`, 'g'), `audit_stages_${table}`), sql), values) };
const { ayahs } = JSON.parse(readFileSync(new URL('../server/data/quran-pages.json', import.meta.url), 'utf8'));
const range = (startSurah, startAyah, endSurah, endAyah, label) => ({
  ...resolveAutomaticRange(ayahs, { startSurah, startAyah, endSurah, endAyah }), label, automatic: true,
});
try {
  for (const table of tables) await connection.query(`CREATE TEMPORARY TABLE audit_stages_${table} LIKE ${table}`);
  const queue = [range(51, 31, 51, 60, 'الجزآن 28 و27'), range(51, 1, 51, 30, 'الجزآن 26 و25'),
    range(50, 1, 42, 53, 'الجزآن 26 و25'), range(41, 47, 41, 54, 'الجزآن 26 و25')];
  await scoped.query(`INSERT INTO student_quran_plans(id,student_id,status,track,start_date,effective_from,
    start_surah,start_ayah,start_page,end_surah,end_ayah,end_page,next_memorization_page,next_review_page,
    daily_pages,schedule_days_json,queued_ranges_json)
    VALUES(17,3,'completed','memorization','2026-09-01','2026-09-01',66,1,560,52,49,525,560,560,1,'[0,1,2,3,4]',?)`, [JSON.stringify(queue)]);
  await scoped.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,track,from_page,to_page,
    from_surah,from_ayah,to_surah,to_ayah,student_status,teacher_completed)
    VALUES(17,3,'2026-09-01','memorization','memorization',560,525,66,1,52,49,'done',1)`);
  await connection.beginTransaction();
  const first = await activateQueuedQuranPlan(scoped, { planId: 17, startDate: '2026-09-02' });
  await connection.commit();
  const [[plan]] = await scoped.query('SELECT * FROM student_quran_plans WHERE id=?', [first]);
  assert.deepEqual([plan.start_surah, plan.start_ayah, plan.end_surah, plan.end_ayah], [51, 1, 51, 60]);
  assert.equal(await activateQueuedQuranPlan(scoped, { planId: first, startDate: '2026-09-03' }), null, 'the active stage is preserved');
  assert.equal(await activateQueuedQuranPlan(scoped, { planId: 17, startDate: '2026-09-03' }), null, 'old transition is idempotent');
  await scoped.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,track,from_page,to_page,
    from_surah,from_ayah,to_surah,to_ayah,student_status,teacher_completed)
    VALUES(?,3,'2026-09-02','memorization','memorization',520,523,51,1,51,60,'done',1)`, [first]);
  await scoped.query("UPDATE student_quran_plans SET status='completed' WHERE id=?", [first]);
  await connection.beginTransaction();
  const second = await activateQueuedQuranPlan(scoped, { planId: first, startDate: '2026-09-03' });
  await connection.commit();
  const [[next]] = await scoped.query('SELECT * FROM student_quran_plans WHERE id=?', [second]);
  assert.equal(next.start_surah, 50, 'the approved Dhariyat advance is never assigned twice');
  assert.equal(next.end_surah, 41);
  assert.equal(next.end_ayah, 54, 'Fussilat is learned in natural ayah order as the next boundary crossing');
  const [[history]] = await scoped.query('SELECT teacher_completed,from_surah,from_ayah,to_surah,to_ayah FROM student_quran_tasks WHERE plan_id=17');
  assert.deepEqual(history, { teacher_completed: 1, from_surah: 66, from_ayah: 1, to_surah: 52, to_ayah: 49 });
  console.log('Automatic stages MySQL passed: legacy queue repair, Dhariyat 1-60, approved advance, no duplicate assignment, active-plan preservation, unique successors and unchanged history; temporary tables only.');
} finally { await connection.end(); }
