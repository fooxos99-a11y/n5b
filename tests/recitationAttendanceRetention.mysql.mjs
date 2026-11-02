import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import express from 'express';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { saveGradingPolicy } from '../server/services/grading.js';
import { saveStaffRecitationPreferences } from '../server/services/staffRecitationPreferences.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST), 'local MySQL only');
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
register(new URL('./fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
const { app: portalApp } = await import('../server/index.js');
const database = `nukhab_attendance_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server;
const diagnostics = [];
const originalWarn = console.warn;
console.warn = message => {
  try {
    const record = JSON.parse(message);
    if (record.event?.startsWith('recitation_')) { diagnostics.push(record); return; }
  } catch { /* Non-JSON warnings are left visible. */ }
  originalWarn(message);
};
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const date = getBusinessDate(), previous = shiftDateOnly(date, -1);
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'Own'),(2,'Other')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'Test','attendance-7','','','','supervisor'),(8,'Other','attendance-8','','','','supervisor')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1),(8,2)');
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES(3,'Test','attendance-3','','',1,?)", [previous]);
  await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
    next_memorization_page,next_review_page,status,daily_pages,link_pages,review_pages)
    VALUES(3,3,?,1,604,1,1,114,6,1,1,'active',1,0,0)`, [previous]);
  await saveGradingPolicy(pool, { generalMargin: 0, weeklyProgram: { workDays: [0,1,2,3,4,5,6], readingDays: [] } });
  for (const [key, value] of Object.entries({ recitationAttendanceSource: 'teacher', weeklyHolidayDays: [],
    recitationSessionDays: [0,1,2,3,4,5,6], automaticAbsenceMessageEnabled: false })) {
    await pool.query('INSERT INTO app_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [key, typeof value === 'string' ? value : JSON.stringify(value)]);
  }
  await saveStaffRecitationPreferences(pool, 7, { memorizationMode: 'count', reviewMode: 'count', linkMode: 'count' });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.traceId = randomUUID();
    req.auth = { role: req.get('x-test-role') || 'supervisor', id: Number(req.get('x-test-id') || 7), name: 'Test' };
    return runWithDatabase(database, {}, next);
  });
  for (const [method, path] of [['get','/supervisors/:id/quran-evaluation'],['post','/students/:id/attendance'],
    ['post','/supervisors/:id/quran-evaluation/:taskId'],['post','/offline-recitation/batch']]) {
    const route = portalApp.router.stack.find(item => item.route?.path === `/api${path}` && item.route.methods[method]).route;
    app[method](path, ...route.stack.map(item => item.handle));
  }
  app.use((error, _req, res, next) => res.headersSent ? next(error) : res.status(error.status || error.statusCode || 500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const call = async (path, body, { role = 'supervisor', id = 7 } = {}) => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-test-role': role, 'x-test-id': String(id) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const ok = result => { assert.equal(result.status, 200, JSON.stringify(result)); return result.body; };
  const attend = status => call('/students/3/attendance', { mode: 'recitation_teacher', date, status });
  const roster = () => call(`/supervisors/7/quran-evaluation?date=${date}`);
  ok(await attend('present'));
  const initial = ok(await roster());
  const task = initial.tasks.find(row => row.studentId === 3 && row.taskType === 'memorization');
  assert.ok(task);
  const sessionId = randomUUID();
  const payload = { date, sessionId, requestId: `${sessionId}:${task.id}`, evaluationMode: 'count', mistakeCount: 0,
    warningCount: 0, hesitationCount: 0, repeatCount: 0, listeningCount: 0 };
  ok(await call(`/supervisors/7/quran-evaluation/${task.id}`, payload));
  const snapshot = async () => {
    const [attempts] = await pool.query('SELECT * FROM student_quran_recitation_attempts WHERE student_id=3 ORDER BY id');
    const [submissions] = await pool.query('SELECT * FROM student_quran_recitation_submissions WHERE student_id=3 ORDER BY session_id');
    const [tasks] = await pool.query('SELECT * FROM student_quran_tasks WHERE student_id=3 ORDER BY id');
    const [grades] = await pool.query("SELECT * FROM student_daily_grades WHERE student_id=3 AND component<>'attendance' ORDER BY id");
    return JSON.stringify({ attempts, submissions, tasks, grades });
  };
  const saved = await snapshot();
  for (const status of ['absent', 'present', 'excused', 'present', 'absent', 'late']) {
    ok(await attend(status));
    const current = ok(await roster());
    const student = current.students.find(row => row.studentId === 3);
    assert.ok(student, `student retained while ${status}`);
    assert.equal(student.attendanceStatus, status);
    assert.equal(student.canSetAttendance, true);
    assert.equal(await snapshot(), saved, `attendance ${status} must preserve recitation records and grades`);
    const [[attendance]] = await pool.query('SELECT status FROM attendance_records WHERE student_id=3 AND record_date=?', [date]);
    assert.equal(attendance.status, status);
    const [[attendanceGrade]] = await pool.query("SELECT passed,detail_json AS detail FROM student_daily_grades WHERE student_id=3 AND grade_date=? AND component='attendance'", [date]);
    assert.equal(Boolean(attendanceGrade.passed), status !== 'absent');
    const detail = typeof attendanceGrade.detail === 'string' ? JSON.parse(attendanceGrade.detail) : attendanceGrade.detail;
    assert.equal(detail.status, status);
    if (['absent', 'excused'].includes(status)) {
      const rejected = await call(`/supervisors/7/quran-evaluation/${task.id}`, { ...payload, sessionId: randomUUID() });
      assert.equal(rejected.status, 404);
      assert.equal(rejected.body.reason, 'ATTENDANCE_REQUIRED');
      assert.equal(await snapshot(), saved);
      const batch = ok(await call('/offline-recitation/batch', { sessions: [{ sessionId: randomUUID(), studentId: 3,
        sessionDate: date, tasks: [{ taskId: task.id, payload }] }] }));
      assert.equal(batch.results[0].result, 'conflict');
      assert.equal(batch.results[0].tasks[0].data.reason, 'ATTENDANCE_REQUIRED');
      assert.equal(await snapshot(), saved);
    }
  }
  for (const options of [{ id: 8 }, { role: 'reciter' }, { role: 'student' }]) {
    assert.equal((await call('/students/3/attendance', { mode: 'recitation_teacher', date, status: 'present' }, options)).status, 403);
  }
  assert.equal((await call('/supervisors/7/quran-evaluation', undefined, { id: 8 })).status, 403);
  // Reproduce a replaced task using the actual SQL selector and inspect its logged reason.
  const [old] = await pool.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages)
    SELECT plan_id,student_id,?,'memorization',from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages FROM student_quran_tasks WHERE id=?`, [previous, task.id]);
  const stale = await call(`/supervisors/7/quran-evaluation/${old.insertId}`, { ...payload, sessionId: randomUUID() });
  assert.equal(stale.status, 404);
  assert.equal(stale.body.reason, 'TASK_REPLACED');
  assert.ok(diagnostics.some(row => row.event === 'recitation_task_rejected' && row.taskId === old.insertId && row.newerTaskId === task.id));
  assert.ok(diagnostics.some(row => row.event === 'recitation_batch_rejected' && row.reason === 'ATTENDANCE_REQUIRED'));
  const foreign = await call(`/supervisors/8/quran-evaluation/${task.id}`, payload, { id: 8 });
  assert.equal(foreign.status, 404);
  assert.equal(foreign.body.reason, 'TASK_UNAVAILABLE');
  assert.equal('studentId' in foreign.body, false);
  console.log('MySQL/HTTP passed: repeated attendance changes retain roster and official results; unauthorized writes blocked; direct and nested rejections identify attendance, stale task, and scope.');
} finally {
  console.warn = originalWarn;
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await pool?.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_attendance_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
