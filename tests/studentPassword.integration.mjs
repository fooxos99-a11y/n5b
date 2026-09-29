import process from 'node:process';
import { setTimeout } from 'node:timers';
import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';
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
 const [committee]=await connection.query("INSERT INTO committees (name) VALUES ('حلقة اختبار اصطناعية')");
 const manager=await api('/auth/login',{loginNumber:'987654321'});
 const student={name:'طالب اختبار اصطناعي',loginNumber:'7654321',committeeId:committee.insertId,guardianPhone:'',nationalId:''};
 await api('/students',student,manager.token,422);
 const created=await api('/students',{...student,password:'12'},manager.token,201);
 assert.equal(created.password,undefined);assert.equal(created.passwordHash,undefined);assert.equal(created.password_hash,undefined);
 const [[saved]]=await connection.query('SELECT password_hash FROM students WHERE id=?',[created.id]);
 assert.match(saved.password_hash,/^scrypt:/);assert.notEqual(saved.password_hash,'12');
 await api('/auth/login',{loginNumber:student.loginNumber},undefined,401);
 await api('/auth/login',{loginNumber:student.loginNumber,password:'wrong'},undefined,401);
 const loggedIn=await api('/auth/login',{loginNumber:student.loginNumber,password:'12'});
 assert.equal(loggedIn.role,'student');
 await api(`/students/${created.id}`,{...student,password:''},manager.token,200,'PUT');
 await api('/auth/login',{loginNumber:student.loginNumber,password:'12'});
 await api(`/students/${created.id}`,{...student,password:'ab'},manager.token,200,'PUT');
 await api('/auth/login',{loginNumber:student.loginNumber,password:'12'},undefined,401);
 await api('/auth/login',{loginNumber:student.loginNumber,password:'ab'});
 const [[sessions]]=await connection.query("SELECT COUNT(*) AS count FROM auth_sessions WHERE user_role='student' AND user_id=?",[created.id]);
 assert.equal(sessions.count,1,'Password change revokes previous sessions');
 await api('/students/bulk',{students:[{...student,loginNumber:'7654322'}]},manager.token,422);
 await api('/students/bulk',{students:[{...student,loginNumber:'7654322',password:'x'}]},manager.token,201);
 await api('/auth/login',{loginNumber:'7654322',password:'x'});
 const [[count]]=await connection.query('SELECT COUNT(*) AS count FROM students');
 assert.equal(count.count,2,'Failed additions leave no student records');
 globalThis.console.log('PASS: real MySQL and API create, bulk, missing/wrong/short password, update, preserved password and session revocation');
} finally {
 child.kill();
 await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,3000);});
 await connection.end();
 globalThis.console.log(`Isolated test databases retained: ${database}, ${platform}`);
}
