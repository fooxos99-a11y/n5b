import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { URL } from 'node:url';
import express from 'express';
import mysql from 'mysql2/promise';
import { db, initDatabase, runWithDatabase } from '../server/db.js';
import { createGradingRouter } from '../server/routes/gradingRoutes.js';
import { computeStudentSessionGrades, saveGradingPolicy, recordReadingGrade } from '../server/services/grading.js';

register(new URL('./fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
const { app: sourceApp, authorizeApiRequest } = await import('../server/index.js');
assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_student_sessions_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
let pool, server;
let today = '2026-10-03';
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'جلسات الاختبار'),(2,'حلقة أخرى')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'مشرف الاختبار','session-staff','','','','supervisor')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1)');
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(7,'trackSession'),(7,'weeklySession')");
  for (const [id, committeeId] of [[3, 1], [9, 2]]) {
    await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES(?,'طالب الاختبار',?,'','',?,'2026-09-01')", [id, `session-student-${id}`, committeeId]);
    await pool.query(`INSERT INTO student_quran_plans(student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status,reading_faces) VALUES(?,'2026-09-01',1,604,1,1,114,6,1,1,'active',10)`, [id]);
  }
  const policy = await saveGradingPolicy(pool, { trackSession: { sessionDay: 2 }, weeklySession: { sessionDay: 0 } });
  await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES('seasonalHolidays','[{\"startDate\":\"2026-10-03\",\"endDate\":\"2026-10-03\"}]') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)");
  await recordReadingGrade(pool, { studentId: 3, date: '2026-09-30', completed: true, requiredFaces: 10, actor: { role: 'manager', id: 1 } });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { role: req.get('x-test-role') || 'manager', id: Number(req.get('x-test-id') || 1) };
    return runWithDatabase(database, {}, next);
  });
  app.use(authorizeApiRequest);
  app.use('/grading', createGradingRouter({ db, today: () => today }));
  for (const path of ['/students/:id/quran-sessions', '/rankings/students', '/rankings/families']) {
    const route = sourceApp.router.stack.find(item => item.route?.path === `/api${path}` && item.route.methods.get).route;
    app.get(path, ...route.stack.map(item => item.handle));
  }
  app.use((error, _req, res, next) => res.headersSent ? next(error) : res.status(error.status || error.statusCode || 500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const request = async (path, body, { role = 'manager', id = 1 } = {}) => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body ? 'PUT' : 'GET', headers: { 'content-type': 'application/json', 'x-test-role': role, 'x-test-id': String(id) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const payload = { studentId: 3, weekStart: '2026-09-27', component: 'track', attendanceStatus: 'present', segments: [] };
  let result = await request('/grading/week?component=track');
  assert.equal(result.status, 200);
  assert.deepEqual([result.body.periodStart, result.body.periodEnd], ['2026-09-29', '2026-10-05']);
  assert.equal(result.body.seasonalHoliday, false);
  assert.equal((await request('/grading/weekly-component', payload)).status, 200, 'can edit during a holiday inside the session week');
  for (today of ['2026-10-04', '2026-10-05']) {
    result = await request('/grading/week?component=track');
    assert.equal(result.body.weekStart, '2026-09-27');
    assert.equal((await request('/grading/weekly-component', { ...payload, attendanceStatus: 'late' })).status, 200);
  }
  const [[count]] = await pool.query("SELECT COUNT(*) AS total FROM student_weekly_components WHERE student_id=3 AND component='track'");
  assert.equal(Number(count.total), 1, 'edits throughout the period update the same record');
  assert.equal((await request('/grading/weekly-component', { ...payload, weekStart: '2026-10-04' })).status, 422, 'Tuesday session has not started on Monday');
  today = '2026-10-06';
  result = await request('/grading/week?component=track');
  assert.equal(result.body.weekStart, '2026-10-04');
  assert.equal((await request('/grading/weekly-component', payload, { role: 'student', id: 3 })).status, 403);
  assert.equal((await request('/grading/weekly-component', { ...payload, studentId: 9 }, { role: 'supervisor', id: 7 })).status, 403);
  assert.equal((await request('/grading/weekly-component', payload, { role: 'supervisor', id: 7 })).status, 200);
  for (const name of ['students', 'families']) assert.equal((await request(`/rankings/${name}`, null, { role: 'student', id: 3 })).status, 200, `MySQL ${name} ranking query`);
  result = await request('/students/3/quran-sessions?view=plan&includePoints=1', null, { role: 'student', id: 3 });
  assert.equal(result.status, 200);
  const current = result.body.weeklyGrades.find(grade => grade.weekStart === '2026-09-27');
  assert.equal(current.records['2026-09-30'].reading.detail.requiredFaces, 10);
  assert.equal(current.records['2026-09-30'].reading.passed, true);
  assert.equal(current.trackDetail.attendanceStatus, 'present');
  assert.equal((await request('/students/9/quran-sessions?view=plan&includePoints=1', null, { role: 'student', id: 3 })).status, 403);
  await recordReadingGrade(pool, { studentId: 3, date: '2026-10-05', completed: true, requiredFaces: 10, actor: { role: 'manager', id: 1 } });
  const [beforeChange] = await pool.query('SELECT * FROM student_weekly_components ORDER BY id');
  assert.equal((await request('/grading/policy', { policy }, { role: 'student', id: 3 })).status, 403);
  assert.equal((await request('/grading/policy', { policy }, { role: 'supervisor', id: 7 })).status, 403);
  assert.equal((await request('/grading/policy', { policy: { ...policy, trackSession: { ...policy.trackSession, sessionDay: 3 } } })).status, 200);
  result = await request('/grading/week?component=track');
  assert.equal(result.body.currentSessionDay, 3, 'picker uses the saved setting even while viewing an older session');
  assert.equal(result.body.sessionDays['2026-09-27'], 2);
  assert.deepEqual([result.body.periodStart, result.body.periodEnd], ['2026-09-29', '2026-10-05'], 'recorded sessions retain their original day');
  const [afterChange] = await pool.query('SELECT * FROM student_weekly_components ORDER BY id');
  assert.deepEqual(afterChange, beforeChange, 'saving a different session day never rewrites existing data');
  const history = await computeStudentSessionGrades(pool, { studentId: 3, today: '2026-10-03' });
  assert.equal(history[0].policy.trackSession.sessionDay, 2);
  assert.ok(history[0].weeklyProgram.grade > 0);
  assert.equal((await request('/grading/weekly-component', { ...payload, attendanceStatus: 'late' })).status, 200, 'historical sessions remain editable after changing their day');
  const [[edited]] = await pool.query("SELECT policy_json AS policy FROM student_weekly_components WHERE student_id=3 AND week_start='2026-09-27' AND component='track'");
  assert.equal((typeof edited.policy === 'string' ? JSON.parse(edited.policy) : edited.policy).trackSession.sessionDay, 2, 'editing history cannot move its date');
  today = '2026-10-07';
  result = await request('/grading/week?component=track');
  assert.deepEqual([result.body.periodStart, result.body.periodEnd], ['2026-10-07', '2026-10-13']);
  // A daily grade freezes scoring for this week, but must not freeze the new session day.
  await recordReadingGrade(pool, { studentId: 3, date: today, completed: true, requiredFaces: 10, actor: { role: 'manager', id: 1 } });
  assert.equal((await request('/grading/weekly-component', { ...payload, weekStart: '2026-10-04' })).status, 200);
  result = await request('/grading/week?component=track&weekStart=2026-09-27');
  assert.equal(result.body.sessionDay, 2);
  assert.equal(result.body.currentSessionDay, 3);
  assert.deepEqual(result.body.sessionDays, { '2026-09-27': 2, '2026-10-04': 3 });
  const sessions = await computeStudentSessionGrades(pool, { studentId: 3, today });
  assert.equal(sessions.find(row => row.weekStart === '2026-09-27').policy.trackSession.sessionDay, 2);
  assert.equal(sessions.find(row => row.weekStart === '2026-10-04').policy.trackSession.sessionDay, 3);
  // Changing the weekly session to a different day never touches track history.
  assert.equal((await request('/grading/weekly-component', { studentId: 3, weekStart: '2026-10-04', component: 'weekly', attendanceStatus: 'present' })).status, 200);
  assert.equal((await request('/grading/policy', { policy: { ...policy, trackSession: { ...policy.trackSession, sessionDay: 3 }, weeklySession: { ...policy.weeklySession, sessionDay: 4 } } })).status, 200);
  result = await request('/grading/week?component=weekly');
  assert.equal(result.body.currentSessionDay, 4);
  assert.equal(result.body.sessionDays['2026-10-04'], 0);
  today = '2026-10-15';
  result = await request('/grading/week?component=weekly');
  assert.equal(result.body.sessionDay, 4);
  assert.deepEqual([result.body.periodStart, result.body.periodEnd], ['2026-10-15', '2026-10-21']);
  assert.equal((await request('/grading/weekly-component', { studentId: 3, weekStart: '2026-10-11', component: 'weekly', attendanceStatus: 'late' })).status, 200);
  process.stdout.write('Isolated MySQL passed: saved day changes, unchanged historical records, per-component timing, rolling weeks, permissions, reading history and rankings.\n');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.end();
  const cleanup = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_student_sessions_[a-f0-9]{12}$/); await cleanup.query('DROP DATABASE IF EXISTS ??', [database]); }
  finally { await cleanup.end(); }
}
