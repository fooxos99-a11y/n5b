import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath, URL } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { getBusinessDate } from '../shared/business-date.js';
import { hashStudentPassword } from '../server/services/studentPassword.js';

dotenv.config({ path: '../../.env.local', quiet: true });
const host = process.env.MYSQL_HOST || '127.0.0.1';
assert.ok(['127.0.0.1', 'localhost'].includes(host), 'Isolated local MySQL only');
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const database = `nukhab_retry_test_${suffix}`;
const platform = `nukhab_retry_platform_${suffix}`;
const config = { host, port: Number(process.env.MYSQL_PORT || 3310), user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '' };
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const server = spawn(process.execPath, ['server/index.js'], { cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
  env: { ...process.env, MYSQL_HOST: host, MYSQL_PORT: String(config.port), MYSQL_DATABASE: database, PLATFORM_MYSQL_DATABASE: platform,
    API_PORT: String(port), SITE_REGISTRATION_NUMBER: '990771', MANAGER_LOGIN_NUMBER: '990772', SEED_DEFAULT_DATA: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', chunk => { log = (log + chunk).slice(-12000); }); server.stderr.on('data', chunk => { log = (log + chunk).slice(-12000); });
const origin = `http://127.0.0.1:${port}/api`;
let pool;
let token;
async function api(path, { method = 'GET', body, auth = token, expected = 200 } = {}) {
  const response = await globalThis.fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Nukhab-Native': '1',
    ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`); return data;
}
const date = getBusinessDate();
let sequence = 0;
const session = (taskIds, { retryOf = '', mistakes = 0, warnings = 0 } = {}) => ({ sessionId: `${String(++sequence).padStart(8, '0')}-1111-4111-8111-111111111111`,
  retryOf, studentId: 3, sessionDate: date, deviceId: '88888888-1111-4111-8111-111111111111',
  createdAtLocal: new Date().toISOString(), committedAtLocal: new Date().toISOString(),
  tasks: taskIds.map(taskId => ({ taskId, planId: 1, planVersion: 1, payload: { evaluationMode: 'count', mistakeCount: mistakes, warningCount: warnings, hesitationCount: 0 } })) });
const send = async (value, auth = token) => (await api('/offline-recitation/batch', { method: 'POST', body: { sessions: [value] }, auth })).results[0];
const state = async () => {
  const [tasks] = await pool.query('SELECT id,teacher_completed AS completed,evaluation_score AS score FROM student_quran_tasks WHERE id IN (1001,1002,1003,1004,1005) ORDER BY id');
  const [grades] = await pool.query('SELECT component,grade FROM student_daily_grades WHERE student_id=3 ORDER BY component');
  const [points] = await pool.query("SELECT dedupe_key AS dedupeKey,points FROM student_point_transactions WHERE student_id=3 ORDER BY id");
  const [[plan]] = await pool.query('SELECT next_memorization_page AS page,next_memorization_surah AS surah,next_memorization_ayah AS ayah FROM student_quran_plans WHERE id=1');
  return { tasks, grades, points, plan };
};
try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw new Error(`API startup failed: ${log}`);
    try { if ((await globalThis.fetch(origin + '/health')).ok) break; } catch { /* Wait for local startup. */ }
    if (attempt > 240) throw new Error(`API startup timed out: ${log}`);
    await new Promise(resolve => globalThis.setTimeout(resolve, 250));
  }
  pool = mysql.createPool({ ...config, database, decimalNumbers: true });
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'حلقة اختبار الإعادة'),(2,'حلقة أخرى')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'معلم اختبار','97777','','','','supervisor'),(8,'معلم آخر','97778','','','','supervisor')");
  await pool.query('UPDATE supervisors SET password_hash = ? WHERE id IN (7,8)', [await hashStudentPassword('local-retry-password')]);
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1),(8,2)');
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id) VALUES(3,'طالب اختبار','98888','','',1)");
  await pool.query("INSERT INTO staff_recitation_preferences(staff_id,memorization_mode,mastery_mode,review_mode,link_mode) VALUES(7,'count','count','count','count')");
  await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,daily_pages,next_memorization_page,next_memorization_surah,next_memorization_ayah,next_review_page,status,schedule_days_json)
    VALUES(1,3,?,2,30,2,1,2,196,2,2,2,1,2,'active','[0,1,2,3,4,5,6]')`, [date]);
  await pool.query("INSERT INTO attendance_records(student_id,record_date,status) VALUES(3,?,'present')", [date]);
  for (const [id, type, page, start, end] of [[1001,'memorization',2,1,5],[1002,'memorization',3,6,16],[1003,'review',2,1,5],[1004,'review',3,6,16],[1005,'link',2,1,5]]) {
    await pool.query(`INSERT INTO student_quran_tasks(id,plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages,student_status,execution_actor_role)
      VALUES(?,1,3,?,?,?, ?,2,?,2,?,1,'done','student')`, [id,date,type,page,page,start,end]);
  }
  await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES('recitationSessionDays','[0,1,2,3,4,5,6]'),('recitationAttendanceSource','teacher'),('memorizationExecutionSource','both'),('reviewExecutionSource','both'),('linkExecutionSource','both') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)");
  token = (await api('/auth/login', { method:'POST', body: { registrationNumber: '990771', loginNumber: '97777', password:'local-retry-password' } })).token;
  assert.ok(token, 'Teacher authenticates');
  await api('/offline-recitation/batch', { method:'POST', body:{sessions:[]}, auth:'', expected:401 });
  const outsider = (await api('/auth/login', { method:'POST', body:{registrationNumber:'990771',loginNumber:'97778',password:'local-retry-password'} })).token;
  const first = session([1001,1002]);
  assert.equal((await send(first)).result, 'accepted');
  const successful = await state(); assert.ok(successful.tasks.slice(0,2).every(row => row.completed === 1));
  const evaluation = await api('/supervisors/7/quran-evaluation');
  assert.deepEqual(evaluation.tasks.filter(task => task.retryOf === first.sessionId).map(task => Number(task.id)).sort(), [1001,1002]);
  assert.equal((await send(session([1001,1002], {retryOf:first.sessionId}), outsider)).result, 'invalid_sequence');
  const incomplete = await send(session([1001], {retryOf:first.sessionId})); assert.notEqual(incomplete.result,'accepted');
  assert.deepEqual(await state(), successful, 'An incomplete retry preserves every prior result and balance');
  const invalid = session([1001,1002], {retryOf:first.sessionId}); invalid.tasks[1].payload.hesitationCount = -1;
  assert.equal((await send(invalid)).result,'conflict','Invalid input can be corrected without a permanent pending lock');
  assert.deepEqual(await state(),successful,'Failure of the second part rolls back grades, points and plan');
  const retry = session([1001,1002], {retryOf:first.sessionId,mistakes:20});
  assert.equal((await send(retry)).result,'accepted');
  const failed = await state(); assert.ok(failed.tasks.slice(0,2).every(row => row.completed === 0));
  assert.notDeepEqual(failed.plan, successful.plan, 'The latest failed memorization rewinds the plan');
  assert.equal((await send(retry)).result,'accepted'); assert.deepEqual(await state(),failed,'A lost response cannot duplicate points');
  const recovered = session([1001,1002], {retryOf:retry.sessionId});
  assert.equal((await send(recovered)).result,'accepted');
  const restored = await state(); assert.deepEqual(restored.plan,successful.plan); assert.deepEqual(restored.points,successful.points);
  // Switching from marks to counts must not carry old word/ayah mistakes forward.
  await pool.query("INSERT INTO student_quran_task_ayah_marks(task_id,surah_number,ayah_number,ayah_text,mark_type,occurrence_count,created_by) VALUES(1001,2,1,'الم','mistake',1,7)");
  const lower = session([1001,1002],{retryOf:recovered.sessionId,warnings:1});
  assert.equal((await send(lower)).result,'accepted');
  const lowerState = await state();
  assert.ok(lowerState.tasks.slice(0,2).every(row=>row.completed===1));
  assert.ok(lowerState.grades.find(row=>row.component==='memorization').grade < successful.grades.find(row=>row.component==='memorization').grade);
  assert.deepEqual(lowerState.plan,successful.plan);
  const [[marks]] = await pool.query('SELECT COUNT(*) AS count FROM student_quran_task_ayah_marks WHERE task_id=1001'); assert.equal(Number(marks.count),0);
  assert.notEqual((await send(first)).result,'accepted'); assert.deepEqual(await state(),lowerState,'Old submissions cannot displace an explicit retry');
  const competing = await Promise.all([send(session([1001,1002],{retryOf:lower.sessionId,warnings:1})),send(session([1001,1002],{retryOf:lower.sessionId,warnings:2}))]);
  assert.equal(competing.filter(result=>result.result==='accepted').length,1,'Only one concurrent retry can replace the same parent');
  assert.notEqual((await send(session([1001,1002],{retryOf:first.sessionId}))).result,'accepted');
  for (const ids of [[1003,1004],[1005]]) {
    const original = session(ids); assert.equal((await send(original)).result,'accepted');
    const repeated = session(ids,{retryOf:original.sessionId,mistakes:20}); assert.equal((await send(repeated)).result,'accepted');
    const [rows] = await pool.query('SELECT teacher_completed AS completed FROM student_quran_tasks WHERE id IN (?)',[ids]);
    assert.ok(rows.every(row=>row.completed === 0));
  }
  const history = await api('/reports/student-recitation-history?studentId=3');
  const mem = history.rows.filter(row=>row.taskType==='memorization');
  assert.equal(mem.length,2); assert.ok(mem.every(row=>row.previousAttempts.length===4 && row.wordMarks.length===0));
  const [[counts]] = await pool.query('SELECT COUNT(*) AS total,SUM(is_official) AS official FROM student_quran_recitation_attempts WHERE task_id IN (1001,1002)');
  assert.equal(Number(counts.total),10); assert.equal(Number(counts.official),2);
  console.log(JSON.stringify({passed:true,isolatedLocalDatabase:database,checks:['authentication','scope denial','full amount','atomic rollback','lower final grade','plan rewind and recovery','point replacement','idempotency','stale retry','review','link','history retention']}));
} finally {
  server.kill(); if(server.exitCode===null) await once(server,'exit');
  if(pool) await pool.end();
  const cleanup = await mysql.createConnection(config);
  for(const name of [database,platform]) {
    assert.match(name,/^nukhab_retry_(test|platform)_[a-f0-9]{12}$/);
    await cleanup.query(`DROP DATABASE IF EXISTS \`${name}\``);
  }
  await cleanup.end();
}
