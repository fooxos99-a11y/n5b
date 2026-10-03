import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { createGradingRouter } from '../server/routes/gradingRoutes.js';
import { getBusinessDate } from '../shared/business-date.js';
import { weekStartOf, addDays, saveGradingPolicy } from '../server/services/grading.js';
import { buildGradingSessionReport } from '../server/services/gradingReports.js';

assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_track_segments_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server;
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const date = getBusinessDate(), weekStart = weekStartOf(date);
  await pool.query("INSERT INTO committees (id,name) VALUES (1,'Track test')");
  await pool.query("INSERT INTO supervisors (id,name,login_number,national_id,phone,job_title,role) VALUES (7,'Test','track-test','','','','admin')");
  await pool.query("INSERT INTO supervisor_dashboard_permissions (supervisor_id,permission_key) VALUES (7,'weeklySession')");
  await pool.query("INSERT INTO students (id,name,login_number,national_id,guardian_phone,committee_id) VALUES (3,'Test','track-test','','',1)");
  await pool.query("INSERT INTO student_quran_plans (id,student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,next_memorization_page,next_review_page,status) VALUES (1,3,1,604,1,1,114,6,1,1,'active')");
  await pool.query(`INSERT INTO student_quran_tasks (plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah) VALUES
    (1,3,?,'link',2,4,2,1,2,29),(1,3,?,'review',5,6,2,30,2,48)`, [date,date]);
  await saveGradingPolicy(pool, { trackSession: { attendanceLate: 3, attendanceExcused: 2, segments: [{ source: 'link', max: 3 }, { source: 'review', max: 7 }, { source: 'link', max: 4 }] }, weeklySession: { attendanceLate: 7, attendanceExcused: 4 } });
  const app = express();
  app.use(express.json());
  app.use((req,_res,next) => {
    const role = req.get('x-test-role');
    req.auth = role ? { role, id: role === 'admin' ? 7 : 1, name: 'Test', tokenHash: req.get('x-test-session') || 'test' } : null;
    runWithDatabase(database, {}, next);
  });
  app.use('/grading', createGradingRouter({ db: () => pool, today: () => date }));
  app.use((error,_req,res,next) => { if (res.headersSent) return next(error); return res.status(error.status || error.statusCode || 500).json({ message: error.message }); });
  server = await new Promise(resolve => { const listener = app.listen(0,'127.0.0.1',() => resolve(listener)); });
  const base = `http://127.0.0.1:${server.address().port}/grading`;
  const call = async (path,body,role='manager',method='POST',session='test') => {
    const response = await globalThis.fetch(`${base}${path}`, { method, headers: { 'Content-Type':'application/json', ...(role ? { 'x-test-role':role } : {}), 'x-test-session':session }, body:JSON.stringify(body) });
    return { status:response.status, body:await response.json() };
  };
  const request = { studentId:3,weekStart };
  for (const role of [null,'student','supervisor','admin']) assert.equal((await call('/track-test',request,role)).status,403);
  assert.equal((await call('/track-test',{ ...request,studentId:4 })).status,403);
  assert.equal((await call('/track-test',{ ...request,weekStart:addDays(date,7) })).status,422);
  assert.equal((await call('/policy',{ policy:{ trackSession:{ segments:[{source:'bad',max:0}] } } },'manager','PUT')).status,422);
  const prepared = await call('/track-test',request);
  assert.equal(prepared.status,200);
  assert.equal(prepared.body.segments.length,3);
  assert.deepEqual(prepared.body.segments.map(row => row.source),['link','review','link']);
  await saveGradingPolicy(pool, { trackSession: { segments: [{ source: 'review', max: 1 }] } });
  const payload = { ...request,component:'track',attended:true,attemptToken:prepared.body.attemptToken,
    segments:prepared.body.segments.map(row => ({ ...row,recorded:true,mistakes:0,warnings:1 })) };
  assert.equal((await call('/weekly-component',payload,'manager','PUT','different')).status,422);
  assert.equal((await call('/weekly-component',{...payload,segments:payload.segments.map((row,index) => index ? row : {...row,range:{...row.range,fromAyah:285}})},'manager','PUT')).status,422);
  const saved = await call('/weekly-component',payload,'manager','PUT');
  assert.equal(saved.status,200);
  assert.equal(saved.body.result.grade,21); assert.equal(saved.body.result.max,24);
  assert.equal((await call('/weekly-component',payload,'admin','PUT')).status,403);
  const latePayload = { ...payload, attendanceStatus: 'late', attended: false };
  const late = await call('/weekly-component',latePayload,'manager','PUT');
  assert.equal(late.status,200); assert.equal(late.body.result.grade,14);
  assert.equal(late.body.result.attendanceStatus,'late'); assert.equal(late.body.result.attended,true);
  const lateReport = await buildGradingSessionReport(pool,{component:'track',from:weekStart,to:date});
  assert.equal(lateReport.rows[0].late,1); assert.equal(lateReport.rows[0].attended,1);
  assert.equal((await call('/weekly-component',{...latePayload,attemptToken:undefined},'manager','PUT')).status,200);
  for (const attendanceStatus of ['invalid',null]) assert.equal((await call('/weekly-component',{...payload,attendanceStatus},'manager','PUT')).status,422);
  assert.equal((await call('/weekly-component',{...request,component:'weekly',attended:'true'},'manager','PUT')).status,422);
  assert.equal((await call('/policy',{policy:{trackSession:{attendanceLate:11}}},'manager','PUT')).status,422);
  assert.equal((await call('/weekly-component',{...payload,attendanceStatus:'excused'},'manager','PUT')).status,422);
  const excused = await call('/weekly-component',{...request,component:'track',attendanceStatus:'excused',segments:[]},'manager','PUT');
  assert.equal(excused.status,200); assert.equal(excused.body.result.grade,2);
  assert.ok(excused.body.result.segments.every(segment => !segment.recorded));
  const excusedReport = await buildGradingSessionReport(pool,{component:'track',from:weekStart,to:date});
  assert.equal(excusedReport.rows[0].excused,1); assert.equal(excusedReport.rows[0].absent,0);
  assert.equal(excusedReport.rows[0].attended,0);
  // Repeating a save keeps a single points entry, and attendance preserves the exact test.
  assert.equal((await call('/weekly-component',payload,'manager','PUT')).status,200);
  assert.equal((await call('/weekly-component',{...payload,attemptToken:undefined},'manager','PUT')).status,200);
  assert.equal((await call('/weekly-component',{...payload,attemptToken:undefined,segments:payload.segments.map(row => ({...row,warnings:0}))},'manager','PUT')).status,422);
  const [[ledger]] = await pool.query('SELECT COUNT(*) AS count,SUM(points) AS points FROM student_point_transactions');
  assert.equal(Number(ledger.count),1); assert.equal(Number(ledger.points),21);
  const pending = await call('/weekly-component',{...request,component:'track',attended:true,segments:[]},'manager','PUT');
  assert.equal(pending.status,200); assert.equal(pending.body.result.grade,10);
  assert.ok(pending.body.result.segments.every(row => !row.recorded));
  for (const [attendanceStatus, grade] of [['late',7],['excused',4],['absent',0]]) {
    const weekly = await call('/weekly-component',{...request,component:'weekly',attendanceStatus},'manager','PUT');
    assert.equal(weekly.status,200); assert.equal(weekly.body.result.grade,grade);
  }
  for (const role of [null,'student','supervisor']) assert.equal((await call('/weekly-component',{...request,component:'weekly',attendanceStatus:'late'},role,'PUT')).status,403);
  await pool.query("DELETE FROM student_quran_tasks WHERE task_type='review'");
  assert.equal((await call('/track-test',request)).status,422);
  globalThis.console.log('Isolated MySQL/HTTP passed: random assigned Quran ranges, weighted grades, frozen policy, points idempotency, attendance preservation, empty test, range tampering, role/session/student/date guards.');
} finally {
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await pool?.end();
  const connection = await mysql.createConnection({ host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD });
  try { assert.match(database,/^nukhab_track_segments_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
