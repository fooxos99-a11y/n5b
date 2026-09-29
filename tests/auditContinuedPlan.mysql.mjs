import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { updateContinuedQuranPlan } from '../server/services/continuedQuranPlan.js';

// All service SQL is redirected to connection-local temporary tables; no student data is read or written.
assert.ok(['127.0.0.1', 'localhost'].includes(process.env.MYSQL_HOST || '127.0.0.1'));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '', database: process.env.MYSQL_DATABASE, decimalNumbers: true });
const scoped = { query: (sql, params) => connection.query(sql.replace(/\bstudent_quran_(plans|tasks|recitation_attempts)\b/g, 'audit_$&'), params) };
try {
  for (const table of ['student_quran_plans', 'student_quran_tasks', 'student_quran_recitation_attempts']) {
    await connection.query(`CREATE TEMPORARY TABLE audit_${table} LIKE ${table}`);
  }
  await scoped.query(`INSERT INTO student_quran_plans
    (id, student_id, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page,
      next_memorization_page, next_review_page, plan_version)
    VALUES (17, 3, 114, 1, 604, 78, 40, 582, 590, 595, 1)`);
  for (const [id, date, completed, studentStatus] of [
    [1, '2026-09-28', null, 'pending'], [2, '2026-09-29', 1, 'done'],
    [3, '2026-09-29', 0, 'pending'], [4, '2026-09-29', null, 'done'],
    [5, '2026-09-29', null, 'pending'], [6, '2026-09-29', null, 'pending'],
  ]) {
    await scoped.query(`INSERT INTO student_quran_tasks
      (id, plan_id, student_id, task_date, task_type, from_page, to_page, teacher_completed, student_status)
      VALUES (?, 17, 3, ?, 'memorization', ?, ?, ?, ?)`, [id, date, 600 - id, 600 - id, completed, studentStatus]);
  }
  await scoped.query(`INSERT INTO student_quran_recitation_attempts
    (task_id, student_id, session_date, attempt_number, teacher_completed, is_official)
    VALUES (5, 3, '2026-09-29', 1, 0, 1)`);
  await updateContinuedQuranPlan(scoped, {
    plan: { id: 17, studentId: 3 }, effectiveFrom: '2026-09-29', scheduleDays: [0, 1, 2, 3, 4],
    scheduleAnchor: { page: 590, surah: 85, ayah: 22 },
    values: { startDate: '2026-09-01', start: { page: 604, surah: 114, ayah: 1 }, end: { page: 582, surah: 78, ayah: 40 },
      track: 'memorization', dailyPages: 2, linkPages: 10, reviewPages: 20, reviewHizbs: 2, readingFaces: 10,
      reviewSplitWeekly: 0, reviewWeekStartDay: 0, reviewWeekEndDay: 6, reviewMinDailyPages: 1 },
  });
  const [[plan]] = await scoped.query('SELECT id, next_memorization_page, next_review_page, plan_version, daily_pages FROM student_quran_plans');
  assert.deepEqual(plan, { id: 17, next_memorization_page: 590, next_review_page: 595, plan_version: 2, daily_pages: 2 });
  const [tasks] = await scoped.query('SELECT id FROM student_quran_tasks ORDER BY id');
  assert.deepEqual(tasks.map(task => task.id), [1, 2, 3, 4, 5]);
  globalThis.console.log('MySQL continuation passed: same plan, preserved progress, approved/failed/attempted tasks; only untouched future task removed.');
} finally { await connection.end(); }
