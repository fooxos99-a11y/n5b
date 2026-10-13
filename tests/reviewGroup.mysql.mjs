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
const { app: portalApp, getActivePlanForStudent } = await import('../server/index.js');
assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_review_group_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server;
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const date = getBusinessDate(), start = shiftDateOnly(date, -1);
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'Own'),(2,'Other')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'Test','group-7','','','','supervisor'),(8,'Other','group-8','','','','supervisor')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1),(8,2)');
  await saveGradingPolicy(pool, { generalMargin: 0, weeklyProgram: { workDays: [0,1,2,3,4,5,6], readingDays: [] } });
  for (const [key, value] of Object.entries({ allowQuranCompensation: true, weeklyHolidayDays: [], recitationSessionDays: [0,1,2,3,4,5,6] })) {
    await pool.query('INSERT INTO app_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [key, JSON.stringify(value)]);
  }
  await saveStaffRecitationPreferences(pool, 7, { memorizationMode: 'count', reviewMode: 'count', linkMode: 'count' });
  const ranges = [[1,10],[11,21],[22,31],[32,41]];
  const seedGroup = async (studentId, taskDate) => {
    const ids = [];
    for (const [index, [from,to]] of ranges.entries()) {
      const [[first]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=? ORDER BY surah_number,ayah_number LIMIT 1', [from]);
      const [[last]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=? ORDER BY surah_number DESC,ayah_number DESC LIMIT 1', [to]);
      const [result] = await pool.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages,hizb_number)
        VALUES(?,?,?,'review',?,?,?,?,?,?,?,?)`, [studentId,studentId,taskDate,from,to,first.surah,first.ayah,last.surah,last.ayah,to-from+1,index+1]);
      ids.push(result.insertId);
    }
    return ids;
  };
  const groups = new Map();
  for (const id of [3,4,5,6]) {
    await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES(?,'Test',?,'','',1,?)", [id, `group-${id}`, start]);
    await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status,daily_pages,review_hizbs,link_pages)
      VALUES(?,?,?,1,604,1,1,114,6,101,1,'active',1,4,0)`, [id,id,start]);
    const [[last]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=100 ORDER BY surah_number DESC,ayah_number DESC LIMIT 1');
    await pool.query(`INSERT INTO student_quran_prior_memorization(student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah)
      VALUES(?,1,100,1,1,?,?)`, [id,last.surah,last.ayah]);
    await pool.query("INSERT INTO attendance_records(student_id,record_date,status) VALUES(?,?,'present')", [id,date]);
    groups.set(id, await seedGroup(id, date));
  }
  const missed = await seedGroup(3, start);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { role:req.get('x-test-role') || 'supervisor', id:Number(req.get('x-test-id') || 7), name:'Test' };
    return runWithDatabase(database, {}, next);
  });
  for (const path of ['/offline-recitation/batch','/supervisors/:id/quran-compensations']) {
    const route = portalApp.router.stack.find(item => item.route?.path === `/api${path}` && item.route.methods.post).route;
    app.post(path, ...route.stack.map(item => item.handle));
  }
  app.use((error, _req, res, next) => res.headersSent ? next(error) : res.status(error.status || error.statusCode || 500).json({ message:error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0,'127.0.0.1',()=>resolve(listener)); });
  const call = async (path, body, headers = {}) => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, { method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body) });
    return { status:response.status, body:await response.json() };
  };
  const sessionFor = (studentId, ids, warnings) => ({ sessionId:randomUUID(),studentId,sessionDate:date,
    tasks:ids.map((taskId,index)=>({taskId,payload:{evaluationMode:'count',warningCount:warnings[index],hesitationCount:0,mistakeCount:0}})) });
  const save = async session => {
    const response = await call('/offline-recitation/batch',{sessions:[session]});
    assert.equal(response.status,200,JSON.stringify(response));
    assert.equal(response.body.results[0].result,'accepted',JSON.stringify(response));
    return response.body.results[0];
  };
  const grade = async studentId => {
    const [[row]] = await pool.query("SELECT grade,max_grade,passed,detail_json FROM student_daily_grades WHERE student_id=? AND grade_date=? AND component='review'",[studentId,date]);
    return row;
  };
  const assertGroup = async (session, passed) => {
    const ids=session.tasks.map(item=>item.taskId);
    const [tasks]=await pool.query('SELECT teacher_completed,warning_count FROM student_quran_tasks WHERE id IN (?) ORDER BY id',[ids]);
    assert.deepEqual(tasks.map(row=>Number(row.teacher_completed)),ids.map(()=>passed?1:0));
    assert.deepEqual(tasks.map(row=>Number(row.warning_count)),session.tasks.map(item=>item.payload.warningCount));
    const [attempts]=await pool.query('SELECT teacher_completed FROM student_quran_recitation_attempts WHERE session_id=? AND is_official=1 ORDER BY task_id',[session.sessionId]);
    assert.deepEqual(attempts.map(row=>Number(row.teacher_completed)),ids.map(()=>passed?1:0));
    const [parts]=await pool.query('SELECT result_json FROM student_quran_recitation_session_parts WHERE session_id=? ORDER BY task_id',[session.sessionId]);
    assert.deepEqual(parts.map(row=>(typeof row.result_json==='string'?JSON.parse(row.result_json):row.result_json).teacherCompleted),ids.map(()=>passed));
  };
  const cap = sessionFor(3,groups.get(3),[15,15,15,15]);
  let response=await call('/offline-recitation/batch',{sessions:[cap]},{'x-test-role':'student','x-test-id':'3'});
  assert.equal(response.status,200,JSON.stringify(response));
  assert.equal(response.body.results[0].result,'invalid_sequence',JSON.stringify(response));
  response=await call('/offline-recitation/batch',{sessions:[cap]},{'x-test-id':'8'});
  assert.equal(response.status,200,JSON.stringify(response));
  assert.equal(response.body.results[0].result,'invalid_sequence',JSON.stringify(response));
  assert.equal((await pool.query('SELECT id FROM student_quran_recitation_attempts'))[0].length,0);
  await save(cap); await assertGroup(cap,true);
  assert.deepEqual([Number((await grade(3)).grade),Number((await grade(3)).max_grade)],[0.4,1]);
  const beforeReplay=(await pool.query('SELECT COUNT(*) AS count FROM student_quran_recitation_attempts'))[0][0].count;
  await save(cap);
  assert.equal((await pool.query('SELECT COUNT(*) AS count FROM student_quran_recitation_attempts'))[0][0].count,beforeReplay);
  for (const [studentId,counts] of [[4,[16,0,0,0]],[5,[0,0,0,16]],[6,[5,5,5,5]]]) {
    const session=sessionFor(studentId,groups.get(studentId),counts);
    const result=await save(session), passed=studentId===6;
    await assertGroup(session,passed);
    assert.deepEqual(result.tasks.map(item=>item.data.teacherCompleted),counts.map(()=>passed),'batch returns final group outcome for earlier parts too');
    assert.equal(Number((await grade(studentId)).grade),passed?0.8:0);
    const plan=await getActivePlanForStudent(pool,studentId);
    assert.equal(await getReviewStartForDate(pool,plan,shiftDateOnly(date,1)),passed?42:1,'failed amount repeats from its first hizb');
  }
  const dailySnapshot=await grade(3);
  const created=await call('/supervisors/7/quran-compensations',{studentId:3,date,taskType:'review'});
  assert.equal(created.status,200,JSON.stringify(created)); assert.equal(created.body.taskIds.length,4);
  const failed=sessionFor(3,created.body.taskIds,[0,0,0,16]);
  const failedResult=await save(failed); await assertGroup(failed,false);
  assert.deepEqual(failedResult.tasks.map(item=>item.data.teacherCompleted),[false,false,false,false]);
  assert.deepEqual(await grade(3),dailySnapshot,'compensation leaves daily grade intact');
  const retry=sessionFor(3,created.body.taskIds,[15,15,15,15]);
  const retryResult=await save(retry); await assertGroup(retry,true);
  assert.deepEqual(retryResult.tasks.map(item=>item.data.teacherCompleted),[true,true,true,true]);
  assert.deepEqual(await grade(3),dailySnapshot);
  const [historical]=await pool.query('SELECT teacher_completed FROM student_quran_recitation_attempts WHERE session_id=? ORDER BY task_id',[failed.sessionId]);
  assert.deepEqual(historical.map(row=>Number(row.teacher_completed)),[0,0,0,0],'retry preserves failed attempt history');
  const [sources]=await pool.query('SELECT teacher_completed FROM student_quran_tasks WHERE id IN (?)',[missed]);
  assert.ok(sources.every(row=>row.teacher_completed===null),'compensation preserves source rows');
  globalThis.console.log('Four-hizb review MySQL/HTTP passed: cap inclusive, grade from one, first/last failure, whole retry/cursor, final receipts, isolated daily grade, history, replay and scope.');
} finally {
  await new Promise(resolve=>server?server.close(resolve):resolve());
  await pool?.end();
  const connection=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT||3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD});
  try { assert.match(database,/^nukhab_review_group_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
