import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { writeFile, rename } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import crypto from 'node:crypto';
const db=await mysql.createConnection({host:'127.0.0.1',port:33316,user:'root',database:'quran_audit_approval'});
const clock='outputs/quran-quality-audit/approval-clock.txt';
async function day(n){await writeFile(clock+'.next',`2026-10-${String(n).padStart(2,'0')}T12:00:00Z`);for(let i=0;i<20;i++){try{await rename(clock+'.next',clock);return;}catch(e){if(e.code!=='EPERM'||i===19){throw e;}await setTimeout(25);}}}
async function api(path,token,body,method=body?'POST':'GET'){
 const r=await globalThis.fetch('http://127.0.0.1:33313/api'+path,{method,headers:{'Content-Type':'application/json','X-Nukhab-Native':'1','X-Registration-Number':'909090',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,200,`${path}: ${data.message}`);return data;
}
const login=n=>api('/auth/login',null,{loginNumber:n,registrationNumber:'909090'});
const evidence=[];
try {
 await day(1);const manager=await login('909091');const settings=await api('/settings',manager.token);
 await api('/settings',manager.token,{...settings,weeklyHolidayDays:[],recitationSessionDays:[0,1,2,3,4,5,6],recitationAmountDay:'same_day',memorizationExecutionSource:'both',reviewExecutionSource:'both',linkExecutionSource:'both'},'PUT');
 const run=crypto.randomBytes(5).toString('hex');
 const [c]=await db.query('INSERT INTO committees (name) VALUES (?)',['اختبار فصل الحفظ '+run]);
 const [s]=await db.query('INSERT INTO students (name,login_number,national_id,guardian_phone,committee_id) VALUES (?,?,?,?,?)',['طالب اختبار '+run,'s'+run,'s'+run,'',c.insertId]);
 const [t]=await db.query('INSERT INTO supervisors (name,login_number,national_id,phone,job_title,role) VALUES (?,?,?,?,?,?)',['معلم اختبار','t'+run,'t'+run,'','معلم','supervisor']);
 await db.query('INSERT INTO supervisor_committees (supervisor_id,committee_id) VALUES (?,?)',[t.insertId,c.insertId]);
 await api('/student-plans/'+s.insertId,manager.token,{startPage:22,endPage:24,dailyPages:1,linkPages:2,reviewPages:3,priorMemorization:[{startPage:2,endPage:21}]},'PUT');
 const tasks=[];
 const today=token=>api(`/students/${s.insertId}/quran-today`,token);
 for(let n=1;n<=3;n++){
  await day(n);const student=await login('s'+run);const data=await today(student.token);const task=data.tasks.find(x=>x.taskType==='memorization');assert.equal(task.fromPage,21+n);tasks.push(task);
  await api(`/students/${s.insertId}/quran-tasks/execution`,student.token,{taskIds:[task.id],status:'done'});
  const after=await today(student.token);assert.equal(after.plan.status,'active','student recording must not close the plan');
  evidence.push({day:n,memorization:task.fromPage,planStatus:after.plan.status});
 }
 const teacher=await login('t'+run);await db.query('INSERT IGNORE INTO attendance_records (student_id,record_date,status) VALUES (?,?,?)',[s.insertId,'2026-10-03','present']);
 const result=await api('/offline-recitation/batch',teacher.token,{sessions:[{sessionId:crypto.randomUUID(),studentId:s.insertId,sessionDate:'2026-10-03',tasks:tasks.map((task,index)=>({taskId:task.id,planId:task.planId,payload:{mistakeCount:index===1?1000:0,warningCount:0}}))}]});
 assert.equal(result.results[0].result,'accepted',JSON.stringify(result));
 assert.deepEqual(result.results[0].tasks.map(x=>x.data.teacherCompleted),[true,false,true]);
 const [[later]]=await db.query('SELECT student_status status FROM student_quran_tasks WHERE id=?',[tasks[2].id]);assert.equal(later.status,'done','later recorded memorization survives earlier failure');
 await day(4);const student=await login('s'+run);const data=await today(student.token);const retry=data.tasks.filter(x=>x.taskType==='memorization');assert.equal(retry.length,1);assert.equal(retry[0].fromPage,23);assert.equal(retry[0].toPage,23);
 for(const task of data.tasks.filter(x=>['link','review'].includes(x.taskType)))assert.ok(!(task.fromPage<=23&&task.toPage>=23),'failed page excluded from review/link');
 await api(`/students/${s.insertId}/quran-tasks/execution`,student.token,{taskIds:[retry[0].id],status:'done'});assert.equal((await today(student.token)).plan.status,'active');
 const teacher4=await login('t'+run);await db.query('INSERT IGNORE INTO attendance_records (student_id,record_date,status) VALUES (?,?,?)',[s.insertId,'2026-10-04','present']);
 const approved=await api(`/supervisors/${teacher4.id}/quran-evaluation/${retry[0].id}`,teacher4.token,{date:'2026-10-04',mistakeCount:0,warningCount:0,requestId:crypto.randomUUID()});assert.equal(approved.teacherCompleted,true);
 const [[plan]]=await db.query('SELECT status FROM student_quran_plans WHERE id=?',[retry[0].planId]);assert.equal(plan.status,'completed');
 evidence.push({retryPage:23,laterPassedPage:24,finalStatus:plan.status});
 await writeFile('outputs/quran-quality-audit/approval-results.json',JSON.stringify(evidence,null,2));
} finally {await db.end();}
