import process from 'node:process';
import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { activateQueuedQuranPlan } from '../server/services/quranPlanQueue.js';

assert.ok(['127.0.0.1', 'localhost'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, decimalNumbers: true });
const scoped = { query: (sql, params) => connection.query(sql.replace(/\bstudent_quran_plans\b/g, 'audit_queue_plans'), params) };
try {
  await connection.query('CREATE TEMPORARY TABLE audit_queue_plans LIKE student_quran_plans');
  const ranges = [
    { startSurah: 2, startAyah: 1, startPage: 2, endSurah: 2, endAyah: 20, endPage: 4 },
    { startSurah: 3, startAyah: 1, startPage: 50, endSurah: 3, endAyah: 20, endPage: 52 },
  ];
  await scoped.query(`INSERT INTO student_quran_plans (id, student_id, status, track, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page,
    next_memorization_page, next_review_page, queued_ranges_json, daily_pages, schedule_days_json, reading_hizbs)
    VALUES (17, 3, 'active', 'mastery', 1, 1, 1, 1, 7, 1, 1, 1, ?, 2, '[0,1,2,3,4]', 3)`, [JSON.stringify(ranges)]);
  await connection.beginTransaction();
  assert.equal(await activateQueuedQuranPlan(scoped, { planId: 17, startDate: '2026-10-04' }), null);
  await scoped.query("UPDATE student_quran_plans SET status = 'completed' WHERE id = 17");
  const successor = await activateQueuedQuranPlan(scoped, { planId: 17, startDate: '2026-10-04' });
  assert.ok(successor > 17);
  assert.equal(await activateQueuedQuranPlan(scoped, { planId: 17, startDate: '2026-10-04' }), null);
  const [[plan]] = await scoped.query('SELECT * FROM student_quran_plans WHERE id = ?', [successor]);
  assert.equal(plan.track, 'mastery'); assert.equal(plan.daily_pages, 2);
  assert.equal(plan.reading_hizbs, 3);
  assert.equal(plan.start_surah, 2); assert.equal(plan.queue_parent_id, 17);
  assert.equal(plan.status, 'active'); assert.deepEqual(plan.queued_ranges_json, [ranges[1]]);
  const next = await activateQueuedQuranPlan(scoped, { planId: successor, startDate: '2026-10-05', manual: true });
  assert.ok(next > successor);
  const [statuses] = await scoped.query('SELECT status FROM student_quran_plans ORDER BY id');
  assert.deepEqual(statuses.map(row => row.status), ['completed', 'paused', 'active']);
  await connection.rollback();
  const [[original]] = await scoped.query('SELECT COUNT(*) AS count FROM student_quran_plans');
  assert.equal(original.count, 1);
  globalThis.console.log('MySQL plan queue passed: isolated temporary table, approval/manual transitions, one successor, preserved history and config, rollback.');
} finally { await connection.end(); }
