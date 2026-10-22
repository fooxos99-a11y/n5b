import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import express from 'express';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';

assert.equal(process.env.MYSQL_HOST, '127.0.0.1');
assert.equal(process.env.MYSQL_PORT, '3310');
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_stats_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
process.env.MYSQL_DATABASE = database;
register(new URL('../scripts/call-archive-local-loader.mjs', import.meta.url), { data: { localCallArchive: true } });
const { initDatabase, runWithDatabase } = await import('../server/db.js');
const { localCallArchiveApp } = await import('../server/index.js');
let pool, server;
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'Own'),(2,'Other')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role,created_at) VALUES(7,'Teacher','stats-7','','','','supervisor','2026-01-01')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1)');
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES(1,'Own student','stats-1','','',1,'2026-01-01'),(2,'Other student','stats-2','','',2,'2026-01-01')");
  const policy = JSON.stringify(normalizeGradingPolicy({ trackSession: { sessionDay: 4 }, weeklySession: { sessionDay: 4 } }));
  await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES('gradingPolicy',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [policy]);
  const add = async (studentId, week, grade, recorded) => pool.query(`INSERT INTO student_weekly_components
    (student_id,week_start,component,attended,grade,max_grade,detail_json,policy_json,recorded_by_role,recorded_by_id)
    VALUES(?,?,'track',1,?,30,?,?,'supervisor',7)`, [studentId, week, grade, JSON.stringify({ attendanceStatus: 'present',
      segments: [{ recorded: true, grade: recorded === 2 ? 10 : 9, max: 10 }, { recorded: recorded === 2, grade: recorded === 2 ? 10 : 0, max: 10 }] }), policy]);
  await add(1, '2026-09-13', 30, 2);
  await add(1, '2026-09-20', 19, 1);
  await add(2, '2026-09-20', 30, 2);
  const route = localCallArchiveApp.router.stack.find(item => item.route?.path === '/api/reports/overview' && item.route.methods.get).route;
  const app = express();
  app.use((req, res, next) => runWithDatabase(database, {}, () => new Promise(resolve => {
    res.once('finish', resolve); req.auth = { role: req.headers['x-test-role'] || 'supervisor', id: 7 }; next();
  })).catch(next));
  app.get('/overview', ...route.stack.map(item => item.handle));
  app.use((error, _req, res, next) => { void next; res.status(error.statusCode || error.status || 500).json({ message: error.message }); });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const get = async (from, to, query = '', role = 'supervisor') => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}/overview?from=${from}&to=${to}${query}`, { headers: { 'x-test-role': role } });
    return { status: response.status, body: await response.json() };
  };
  const early = await get('2026-09-22', '2026-09-23');
  assert.equal(early.status, 200, JSON.stringify(early.body));
  assert.equal(early.body.grades.trackSession.grade, 0);
  assert.equal(early.body.grades.trackSession.max, 0);
  assert.equal(early.body.grades.trackSession.percentage, null);
  const day = await get('2026-09-24', '2026-09-24');
  const custom = await get('2026-09-24', '2026-09-25');
  assert.equal(day.status, 200, JSON.stringify(day.body));
  assert.equal(day.body.grades.trackSession.grade, 19);
  assert.equal(day.body.grades.trackSession.max, 30);
  assert.equal(day.body.grades.trackSession.segments.expected, 2);
  assert.equal(day.body.grades.trackSession.segments.tested, 1);
  assert.equal(custom.body.grades.trackSession.percentage, day.body.grades.trackSession.percentage);
  assert.equal(day.body.totals.studentsCount, 1, 'teacher scope excludes the other circle');
  assert.ok(day.body.generatedAt);
  const month = await get('2026-09-01', '2026-09-24');
  assert.equal(month.body.grades.trackSession.grade, 49);
  assert.equal(month.body.grades.trackSession.max, 120);
  assert.equal(month.body.grades.trackSession.segments.expected, 8);
  assert.equal(month.body.grades.trackSession.percentage, 40.8);
  assert.equal((await get('2026-09-24', '2026-09-24', '&committeeId=2')).body.totals.studentsCount, 0);
  assert.equal((await get('2026-09-24', '2026-09-24', '', 'student')).status, 403);
  assert.equal((await get('2026-09-25', '2026-09-24')).status, 422);
  await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES('seasonalHolidays',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [JSON.stringify([{ startDate: '2026-09-24', endDate: '2026-09-24' }])]);
  const holiday = await get('2026-09-24', '2026-09-25');
  assert.equal(holiday.body.grades.trackSession.max, 0);
  assert.equal(holiday.body.grades.trackSession.grade, 0);
  console.log('Statistics MySQL/HTTP passed: exact daily/custom/month boundaries, due maxima, tested coverage, holiday exclusion, generated time, invalid ranges and role/circle isolation.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool?.end();
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3310, user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '' });
  try { assert.match(database, /^nukhab_stats_[a-f0-9]{16}$/); await connection.query('DROP DATABASE IF EXISTS ??', [database]); }
  finally { await connection.end(); }
}
