import process from 'node:process';
import { setTimeout } from 'node:timers';
import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
import { loadComplexRankings } from '../server/services/complexRankings.js';
import { sessionAttendanceCountsSql } from '../server/services/sessionAttendanceSql.js';
const database = `nukhab_password_test_${Date.now()}`;
const platform = `${database}_platform`;
const port = 3097;
assert.equal(process.env.MYSQL_HOST, '127.0.0.1');
const connection = await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD});
const child = spawn(process.execPath, ['server/index.js'], {windowsHide:true, stdio:['ignore','pipe','pipe'], env:{...process.env,MYSQL_DATABASE:database,PLATFORM_MYSQL_DATABASE:platform,API_PORT:String(port),API_HOST:'127.0.0.1',MANAGER_LOGIN_NUMBER:'987654321',MANAGER_NAME:'مدير اختبار اصطناعي',PUBLIC_APP_URL:`http://127.0.0.1:${port}`,PUBLIC_API_URL:`http://127.0.0.1:${port}/api`,PLATFORM_PUBLIC_API_URL:`http://127.0.0.1:${port}/api`,WHATSAPP_AUTH_PATH:`.local/password-test-${Date.now()}`,PLATFORM_OWNER_USERNAME:'',PLATFORM_OWNER_PASSWORD:'',PLATFORM_OWNER_REGISTRATION_NUMBER:'',PLATFORM_OWNER_LOGIN_NUMBER:''}});
let startupLog = '';
child.stdout.on('data', data => {startupLog += data;});
child.stderr.on('data', data => {startupLog += data;});
const api = async (path, body, token, expected=200, method='POST') => {
 const response = await globalThis.fetch(`http://127.0.0.1:${port}/api${path}`,{method,headers:{'Content-Type':'application/json','X-Nukhab-Native':'1',...(token?{Authorization:`Bearer ${token}`}:{})},body:body === undefined?undefined:JSON.stringify(body)});
 const payload=await response.json();
 assert.equal(response.status,expected,`${method} ${path}: ${response.status} ${payload.message||''}`);
 return payload;
};
try {
 let ready=false;
 for(let i=0;i<240;i++){
  if(child.exitCode!==null) throw new Error(`API startup failed: ${startupLog.replace(/password[^\n]*/gi,'[redacted]')}`);
  try { if((await globalThis.fetch(`http://127.0.0.1:${port}/api/health`)).ok){ready=true;break;} } catch { /* Await isolated server startup. */ }
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 assert.ok(ready,'Isolated API starts');
 await connection.query(`USE \`${database}\``);
 const [complex] = await connection.query("INSERT INTO complexes (name) VALUES ('مجمع اختبار اصطناعي')");
 const [committee]=await connection.query("INSERT INTO committees (name, complex_id) VALUES ('حلقة اختبار اصطناعية', ?)", [complex.insertId]);
 const manager=await api('/auth/login',{loginNumber:'987654321'});
 const student={name:'طالب اختبار اصطناعي',loginNumber:'7654321',complexId:complex.insertId,committeeId:committee.insertId,guardianPhone:'',nationalId:''};
 await api('/students',student,manager.token,422);
 const created=await api('/students',{...student,password:'12'},manager.token,201);
 assert.equal(created.password,undefined);assert.equal(created.passwordHash,undefined);assert.equal(created.password_hash,undefined);
 const [[saved]]=await connection.query('SELECT password_hash FROM students WHERE id=?',[created.id]);
 assert.match(saved.password_hash,/^scrypt:/);assert.notEqual(saved.password_hash,'12');
 await api('/auth/login',{loginNumber:student.loginNumber},undefined,401);
 await api('/auth/login',{loginNumber:student.loginNumber,password:'wrong'},undefined,401);
 const loggedIn=await api('/auth/login',{loginNumber:student.loginNumber,password:'12'});
 assert.equal(loggedIn.role,'student');
 for (const password of [undefined, '', null, 123]) {
  await api(`/students/${created.id}`,{...student,password},manager.token,422,'PUT');
 }
 await api(`/students/${created.id}`,{...student,password:'ab'},loggedIn.token,403,'PUT');
 await api('/auth/login',{loginNumber:student.loginNumber,password:'12'});
 await api(`/students/${created.id}`,{...student,password:'ab'},manager.token,200,'PUT');
 await api('/auth/login',{loginNumber:student.loginNumber,password:'12'},undefined,401);
 const activeStudent = await api('/auth/login',{loginNumber:student.loginNumber,password:'ab'});
 const [[sessions]]=await connection.query("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_role='student' AND user_id=?",[created.id]);
 assert.equal(sessions.count,1,'Password change revokes previous sessions');
 await api('/students/bulk',{students:[{...student,loginNumber:'7654322'}]},manager.token,422);
 await api('/students/bulk',{students:[{...student,loginNumber:'7654322',password:'x'}]},manager.token,201);
 await api('/auth/login',{loginNumber:'7654322',password:'x'});
 const [[count]]=await connection.query('SELECT COUNT(*) AS count FROM students');
 assert.equal(count.count,2,'Failed additions leave no student records');
 await connection.query('UPDATE committees SET complex_id = ?, points = 60 WHERE id = ?', [complex.insertId, committee.insertId]);
 await connection.query('UPDATE students SET points = CASE WHEN id = ? THEN 20 ELSE 40 END', [created.id]);
 const [emptyComplex] = await connection.query("INSERT INTO complexes (name) VALUES ('مجمع فارغ اصطناعي')");
 const ranked = await loadComplexRankings(connection, 'total');
 assert.equal(ranked.find(row => row.id === complex.insertId).points, 60, 'Circle points are not multiplied by student count');
 assert.equal(ranked.find(row => row.id === emptyComplex.insertId).points, 0);
 const averageRanked = await loadComplexRankings(connection, 'average');
 assert.equal(averageRanked.find(row => row.id === complex.insertId).points, 30, 'Average uses all students');
 const visible = await api('/rankings/complexes', undefined, activeStudent.token, 200, 'GET');
 assert.ok(visible.some(row => row.id === complex.insertId && row.studentsCount === 2));
 assert.deepEqual(await api('/rankings/complexes', undefined, undefined, 200, 'GET'), visible);
 await connection.query('CREATE TEMPORARY TABLE session_attendance_check (attended INT, detail_json JSON)');
 for (const detail of [{ attendanceStatus: null, attendanceRecorded: false }, { attendanceStatus: 'absent', attendanceRecorded: false }, { attendanceStatus: 'absent', attendanceRecorded: true }, { attendanceStatus: 'excused', attendanceRecorded: true }]) {
  await connection.query('INSERT INTO session_attendance_check VALUES (0, ?)', [JSON.stringify(detail)]);
 }
 const [[attendanceCounts]] = await connection.query(`SELECT ${sessionAttendanceCountsSql()} FROM session_attendance_check`);
 assert.equal(Number(attendanceCounts.absent), 1, 'Only explicitly recorded absence counts');
 globalThis.console.log('PASS: real MySQL and API create, bulk, required passwords on edit, denied student edits, failed-edit rollback and session revocation');
 globalThis.console.log('PASS: real MySQL complex ranking totals/averages, empty complexes, student/public endpoint and unrecorded session attendance');
} finally {
 child.kill();
 await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,3000);});
 await connection.end();
 globalThis.console.log(`Isolated test databases retained: ${database}, ${platform}`);
}
