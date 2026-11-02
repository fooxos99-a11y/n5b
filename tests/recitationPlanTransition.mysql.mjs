import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { URL } from 'node:url';
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
const database = `nukhab_transition_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server;
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const date = getBusinessDate(), tomorrow = shiftDateOnly(date, 1);
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'Own'),(2,'Other')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'Test','transition-7','','','','supervisor'),(8,'Other','transition-8','','','','supervisor')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1),(8,2)');
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES(3,'Test','transition-3','','',1,?)", [date]);
  await saveGradingPolicy(pool, { generalMargin: 0, weeklyProgram: { workDays: [0,1,2,3,4,5,6], readingDays: [] } });
  for (const [key, value] of Object.entries({ recitationAttendanceSource: 'teacher', weeklyHolidayDays: [], recitationSessionDays: [0,1,2,3,4,5,6] })) {
    await pool.query('INSERT INTO app_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [key, typeof value === 'string' ? value : JSON.stringify(value)]);
  }
  await saveStaffRecitationPreferences(pool, 7, { memorizationMode: 'count', reviewMode: 'count', linkMode: 'count' });
  const queued = [{ startPage: 5, startSurah: 2, startAyah: 25, endPage: 10, endSurah: 2, endAyah: 69 }];
  await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
    next_memorization_page,next_memorization_surah,next_memorization_ayah,next_review_page,status,daily_pages,link_pages,review_pages,review_hizbs,queued_ranges_json)
    VALUES(3,3,?,4,4,2,17,2,24,4,2,17,1,'active',1,3,2,2,?)`, [date, JSON.stringify(queued)]);
  await pool.query('INSERT INTO student_quran_prior_memorization(student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah) VALUES(3,1,1,1,1,1,7)');
  await pool.query('INSERT INTO student_quran_prior_memorization(student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah) VALUES(3,3,3,2,6,2,16)');
  const [[reviewStart]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=11 ORDER BY surah_number,ayah_number LIMIT 1');
  const [[reviewEnd]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=31 ORDER BY surah_number DESC,ayah_number DESC LIMIT 1');
  await pool.query('INSERT INTO student_quran_prior_memorization(student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah) VALUES(3,11,31,?,?,?,?)', [reviewStart.surah,reviewStart.ayah,reviewEnd.surah,reviewEnd.ayah]);
  await pool.query("INSERT INTO attendance_records(student_id,record_date,status) VALUES(3,?,'present')", [date]);
  for (const [id, type, page, surah, from, to, faces] of [
    [1001,'memorization',4,2,17,24,1],
    [1002,'link',1,1,1,7,1], [1003,'link',3,2,6,16,1],
    [1004,'review',1,1,1,7,1], [1005,'review',3,2,6,16,1],
  ]) await pool.query(`INSERT INTO student_quran_tasks(id,plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages)
    VALUES(?,3,3,?,?,?,?,?,?,?,?,?)`, [id,date,type,page,page,surah,from,surah,to,faces]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.traceId = randomUUID();
    req.auth = { role: req.get('x-test-role') || 'supervisor', id: Number(req.get('x-test-id') || 7), name: 'Test' };
    return runWithDatabase(database, {}, next);
  });
  for (const [method, path] of [['get','/supervisors/:id/quran-evaluation'],['post','/offline-recitation/batch']]) {
    const route = portalApp.router.stack.find(item => item.route?.path === `/api${path}` && item.route.methods[method]).route;
    app[method](path, ...route.stack.map(item => item.handle));
  }
  app.use((error, _req, res, next) => res.headersSent ? next(error) : res.status(error.status || error.statusCode || 500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const call = async (path, body, id = 7) => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-test-id': String(id) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const roster = async () => {
    const result = await call(`/supervisors/7/quran-evaluation?date=${date}`);
    assert.equal(result.status, 200, JSON.stringify(result));
    return result.body;
  };
  const makeSession = ids => ({ sessionId: randomUUID(), studentId: 3, sessionDate: date,
    tasks: ids.map(taskId => ({ taskId, planId: 3, planVersion: 1, payload: {
      evaluationMode: 'count', warningCount: 0, hesitationCount: 0, mistakeCount: 0, repeatCount: 0, listeningCount: 0 } })) });
  const send = async session => {
    const result = await call('/offline-recitation/batch', { sessions: [session] });
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.body.results[0].result, 'accepted', JSON.stringify(result));
  };
  const before = await roster();
  const revision = before.tasks.filter(task => task.planId === 3 && ['review','link'].includes(task.taskType));
  assert.equal(revision.filter(task => task.taskType === 'link').length, 2);
  assert.equal(revision.filter(task => task.taskType === 'review').length, 2);
  const memorization = makeSession([1001]);
  await send(memorization);
  const [[parent]] = await pool.query('SELECT status FROM student_quran_plans WHERE id=3');
  assert.equal(parent.status, 'completed');
  const [[next]] = await pool.query('SELECT * FROM student_quran_plans WHERE queue_parent_id=3');
  assert.ok(next);
  const [[nextDate]] = await pool.query("SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate FROM student_quran_plans WHERE id=?", [next.id]);
  assert.equal(nextDate.startDate, tomorrow);
  const successor = JSON.stringify(next);
  const [[acceptedMemorization]] = await pool.query('SELECT * FROM student_quran_recitation_attempts WHERE task_id=1001 AND is_official=1');
  const savedMemorization = JSON.stringify(acceptedMemorization);
  for (let refresh = 0; refresh < 2; refresh++) {
    const current = await roster();
    assert.ok(current.students.some(student => student.studentId === 3));
    for (const task of revision) assert.ok(current.tasks.some(row => row.id === task.id), `pending ${task.taskType} ${task.id} retained after completion`);
    assert.equal(current.tasks.some(task => task.planId === next.id), false, 'future plan creates no work in the old session');
  }
  const foreign = await call('/offline-recitation/batch', { sessions: [makeSession(revision.filter(task => task.taskType === 'link').map(task => task.id))] }, 8);
  assert.notEqual(foreign.body.results[0].result, 'accepted');
  for (const type of ['link','review']) {
    const session = makeSession(revision.filter(task => task.taskType === type).map(task => task.id));
    await send(session);
    await send(session); // A response retry must not create a duplicate successor or grade.
    const [[currentNext]] = await pool.query('SELECT * FROM student_quran_plans WHERE id=?', [next.id]);
    assert.equal(JSON.stringify(currentNext), successor, `${type} must not change the successor`);
  }
  const [[currentMemorization]] = await pool.query('SELECT * FROM student_quran_recitation_attempts WHERE task_id=1001 AND is_official=1');
  assert.equal(JSON.stringify(currentMemorization), savedMemorization);
  const [[successorCount]] = await pool.query('SELECT COUNT(*) AS count FROM student_quran_plans WHERE queue_parent_id=3');
  assert.equal(successorCount.count, 1);
  const final = await roster();
  assert.ok(final.students.some(student => student.studentId === 3));
  assert.ok(final.deliveryReceipts.some(receipt => receipt.taskId === 1001 && receipt.status === 'server_saved'));
  console.log('MySQL/HTTP passed: final memorization activates one next-day plan; pending link/review survive refresh and can be accepted; scope, retries, old result and successor preserved.');
} finally {
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await pool?.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_transition_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
