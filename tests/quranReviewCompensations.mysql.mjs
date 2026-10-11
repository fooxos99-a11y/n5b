import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import { URL } from 'node:url';
import express from 'express';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { saveGradingPolicy } from '../server/services/grading.js';
import { saveStaffRecitationPreferences } from '../server/services/staffRecitationPreferences.js';
import { getReviewStartForDate } from '../server/services/quranReviewSchedule.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

register(new URL('./fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
const { app: portalApp, ensureStudentPlanTasks, getActivePlanForStudent, loadSettings } = await import('../server/index.js');
assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_review_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server;
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const date = getBusinessDate(), start = shiftDateOnly(date, -3);
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'Own'),(2,'Other')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'Test','review-7','','','','supervisor'),(8,'Other','review-8','','','','supervisor')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1),(8,2)');
  for (const [id, committee] of [[3, 1], [4, 2]]) {
    await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES(?,'Test',?,'','',?,?)", [id, `review-${id}`, committee, start]);
    await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status,daily_pages,review_hizbs,link_pages)
      VALUES(?,?,?,1,604,1,1,114,6,101,1,'active',1,1,0)`, [id, id, start]);
    const [[last]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=100 ORDER BY surah_number DESC,ayah_number DESC LIMIT 1');
    await pool.query(`INSERT INTO student_quran_prior_memorization(student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah)
      VALUES(?,1,100,1,1,?,?)`, [id, last.surah, last.ayah]);
  }
  await saveGradingPolicy(pool, { generalMargin: 0, weeklyProgram: { workDays: [0,1,2,3,4,5,6], readingDays: [] } });
  for (const [key, value] of Object.entries({ allowQuranCompensation: true, weeklyHolidayDays: [], recitationSessionDays: [0,1,2,3,4,5,6] })) {
    await pool.query('INSERT INTO app_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [key, JSON.stringify(value)]);
  }
  await saveStaffRecitationPreferences(pool, 7, { memorizationMode: 'count', reviewMode: 'count', linkMode: 'count' });
  const seedReview = async (taskDate, from, to, accepted = null, studentId = 3) => {
    const [[first]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=? ORDER BY surah_number,ayah_number LIMIT 1', [from]);
    const [[last]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=? ORDER BY surah_number DESC,ayah_number DESC LIMIT 1', [to]);
    const [result] = await pool.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages,teacher_completed)
      VALUES(?,?,?,'review',?,?,?,?,?,?,?,?)`, [studentId,studentId,taskDate,from,to,first.surah,first.ayah,last.surah,last.ayah,to-from+1,accepted]);
    return result.insertId;
  };
  const oldest = [await seedReview(start, 1, 5), await seedReview(start, 6, 10)];
  await seedReview(shiftDateOnly(date, -2), 11, 20);
  await seedReview(shiftDateOnly(date, -1), 21, 30);
  const todayTask = await seedReview(date, 31, 40, 0);
  const legacyMissed = await seedReview(start, 1, 40, null, 4);
  const legacyUntouched = await seedReview(date, 1, 10, null, 4);
  await pool.query('UPDATE student_quran_tasks SET compensation_days=3 WHERE id IN (?,?)', [legacyMissed,legacyUntouched]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { role: req.get('x-test-role') || 'supervisor', id: Number(req.get('x-test-id') || 7), name: 'Test' };
    return runWithDatabase(database, {}, next);
  });
  for (const [method, path] of [['get','/supervisors/:id/quran-compensations'],['post','/supervisors/:id/quran-compensations'],['get','/supervisors/:id/quran-evaluation'],['post','/supervisors/:id/quran-evaluation/:taskId'],['post','/offline-recitation/batch']]) {
    const route = portalApp.router.stack.find(item => item.route?.path === `/api${path}` && item.route.methods[method]).route;
    app[method](path, ...route.stack.map(item => item.handle));
  }
  app.use((error, _req, res, next) => res.headersSent ? next(error) : res.status(error.status || error.statusCode || 500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const call = async (path, body, { role = 'supervisor', id = 7 } = {}) => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET',
      headers: { 'content-type':'application/json', 'x-test-role':role, 'x-test-id':String(id) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const ok = response => { assert.equal(response.status, 200, JSON.stringify(response)); return response.body; };
  const summary = async () => ok(await call(`/supervisors/7/quran-compensations?studentId=3&date=${date}`)).review;
  const create = (studentId = 3, options) => call('/supervisors/7/quran-compensations', { studentId, date, taskType:'review' }, options);
  const evaluate = (taskId, extra = {}, options) => {
    const sessionId = randomUUID();
    return call(`/supervisors/7/quran-evaluation/${taskId}`, { date, sessionId, requestId:`${sessionId}:${taskId}`, evaluationMode:'count', mistakeCount:0, warningCount:0, hesitationCount:0, ...extra }, options);
  };
  const evaluateGroup = async (ids, payloads = {}) => {
    const session = { sessionId:randomUUID(), studentId:3, sessionDate:date,
      tasks:ids.map(taskId => ({ taskId, payload:{ evaluationMode:'count', warningCount:0, hesitationCount:0, mistakeCount:0, ...payloads[taskId] } })) };
    const result = ok(await call('/offline-recitation/batch', { sessions:[session] }));
    assert.equal(result.results[0].result, 'accepted', JSON.stringify(result));
    return session;
  };
  assert.equal((await create(3, { role:'student', id:3 })).status, 403);
  assert.equal((await create(3, { id:8 })).status, 403);
  assert.equal((await create(4)).status, 404);
  assert.equal((await create()).status, 422, 'attendance is required');
  await pool.query("INSERT INTO attendance_records(student_id,record_date,status) VALUES(3,?,'present')", [date]);
  let state = await summary();
  assert.equal(state.owed, 3); assert.equal(state.sourceDate, start); assert.ok(state.blocked);
  await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES('seasonalHolidays',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)", [JSON.stringify([{ startDate:start, endDate:start }])]);
  assert.equal((await summary()).owed, 2, 'holidays never count as missed review');
  await pool.query("DELETE FROM app_settings WHERE setting_key='seasonalHolidays'");
  assert.equal((await create()).status, 409, 'reject creation until daily review accepted');
  ok(await evaluate(todayTask));
  state = await summary(); assert.equal(state.blocked, null);
  const [oldSnapshot] = await pool.query('SELECT * FROM student_quran_tasks WHERE id IN (?) ORDER BY id', [oldest]);
  const plan = await getActivePlanForStudent(pool, 3);
  const cursorBefore = await getReviewStartForDate(pool, plan, shiftDateOnly(date, 1));
  const concurrent = await Promise.all([create(), create()]);
  const created = ok(concurrent[0]);
  assert.deepEqual(ok(concurrent[1]).taskIds, created.taskIds, 'one pending amount despite concurrent requests');
  assert.equal(created.taskIds.length, 2, 'both ranges belong to a single missed day');
  const [compRows] = await pool.query('SELECT from_page,to_page,DATE_FORMAT(compensated_review_date,\'%Y-%m-%d\') AS sourceDate,execution_actor_role FROM student_quran_tasks WHERE id IN (?) ORDER BY id', [created.taskIds]);
  assert.deepEqual(compRows.map(row => [row.from_page,row.to_page,row.sourceDate,row.execution_actor_role]), [[1,5,start,'teacher'],[6,10,start,'teacher']]);
  const evaluation = ok(await call(`/supervisors/7/quran-evaluation?date=${date}`));
  assert.ok(created.taskIds.every(id => evaluation.tasks.some(task => Number(task.id) === id)), 'compensation is visible to the normal evaluation flow');
  assert.ok(evaluation.students.find(student => Number(student.studentId) === 3)?.hasCompensation);
  assert.equal((await evaluate(created.taskIds[0], {}, { role:'student', id:3 })).status, 403);
  assert.equal((await evaluate(created.taskIds[0], {}, { id:8 })).status, 403);
  await pool.query('UPDATE student_quran_tasks SET teacher_completed=0 WHERE id=?', [todayTask]);
  assert.equal((await evaluate(created.taskIds[0])).status, 409, 'direct grading cannot bypass daily completion');
  await pool.query('UPDATE student_quran_tasks SET teacher_completed=1 WHERE id=?', [todayTask]);
  await evaluateGroup(created.taskIds, { [created.taskIds[0]]:{ notMemorized:true } });
  state = await summary(); assert.equal(state.owed, 3); assert.deepEqual(state.pendingTaskIds, created.taskIds);
  const pendingEvaluation = ok(await call(`/supervisors/7/quran-evaluation?date=${date}`));
  assert.ok(created.taskIds.every(id => pendingEvaluation.tasks.some(task => Number(task.id) === id)), 'resume includes both rejected and previously accepted parts');
  assert.deepEqual(ok(await create()).taskIds, created.taskIds, 'failed recitation resumes its existing amount');
  await evaluateGroup(created.taskIds, { [created.taskIds[0]]:{ warningCount:1, hesitationCount:2 } });
  state = await summary(); assert.equal(state.owed, 2); assert.equal(state.done, 1); assert.equal(state.sourceDate, shiftDateOnly(date, -2));
  const [oldAfter] = await pool.query('SELECT * FROM student_quran_tasks WHERE id IN (?) ORDER BY id', [oldest]);
  assert.deepEqual(oldAfter, oldSnapshot, 'original missed tasks remain intact');
  assert.equal(await getReviewStartForDate(pool, plan, shiftDateOnly(date, 1)), cursorBefore, 'compensation does not advance regular review');
  const next = ok(await create()); assert.equal(next.taskIds.length, 1); assert.notDeepEqual(next.taskIds, created.taskIds);
  ok(await evaluate(next.taskIds[0])); assert.equal((await summary()).owed, 1);
  const last = ok(await create()); ok(await evaluate(last.taskIds[0]));
  assert.equal((await summary()).owed, 0);
  assert.equal((await create()).status, 422);
  const [[counts]] = await pool.query('SELECT warning_count,hesitation_count,teacher_completed FROM student_quran_tasks WHERE id=?', [created.taskIds[0]]);
  assert.deepEqual([counts.warning_count,counts.hesitation_count,counts.teacher_completed], [1,2,1]);
  await runWithDatabase(database, {}, async () => {
    const other = await getActivePlanForStudent(pool, 4);
    await ensureStudentPlanTasks(pool, other, date, await loadSettings());
    const [[regular]] = await pool.query("SELECT SUM(target_pages) AS faces FROM student_quran_tasks WHERE student_id=4 AND task_date=? AND task_type='review' AND compensation_index=0", [date]);
    assert.ok(Number(regular.faces) <= 11, 'daily review remains one normal hizb despite three missed days');
    const [[credits]] = await pool.query("SELECT MAX(compensation_days) AS days FROM student_quran_tasks WHERE student_id=4 AND task_date=? AND task_type='review'", [date]);
    assert.equal(Number(credits.days), 0, 'untouched old daily assignments carry no merged credit after repair');
  });
  await pool.query("UPDATE student_quran_tasks SET teacher_completed=1,student_status='done' WHERE student_id=4 AND task_date=? AND task_type='review' AND compensation_index=0", [date]);
  await pool.query("INSERT INTO attendance_records(student_id,record_date,status) VALUES(4,?,'present')", [date]);
  const legacySummary = ok(await call(`/supervisors/8/quran-compensations?studentId=4&date=${date}`, undefined, { id:8 })).review;
  assert.equal(legacySummary.owed, 3);
  const legacyNext = ok(await call('/supervisors/8/quran-compensations', { studentId:4,date,taskType:'review' }, { id:8 }));
  const [[legacyAmount]] = await pool.query('SELECT SUM(target_pages) AS faces FROM student_quran_tasks WHERE id IN (?)', [legacyNext.taskIds]);
  assert.ok(Number(legacyAmount.faces) <= 11, 'pending historical merged reviews are compensated one normal day at a time');
  const [[legacyOriginal]] = await pool.query('SELECT to_page,compensation_days FROM student_quran_tasks WHERE id=?', [legacyMissed]);
  assert.deepEqual([legacyOriginal.to_page,legacyOriginal.compensation_days], [40,3], 'historic merged source remains untouched');
  globalThis.console.log('Review compensation MySQL/HTTP passed: daily gate, roles/scope, concurrent resume, full-group credit, independent counts, historical ranges, cursor preservation, normal daily amount.');
} finally {
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await pool?.end();
  const connection = await mysql.createConnection({ host:process.env.MYSQL_HOST, port:Number(process.env.MYSQL_PORT || 3306), user:process.env.MYSQL_USER, password:process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_review_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
