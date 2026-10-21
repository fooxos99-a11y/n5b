import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import process from 'node:process';
import { createPassingGuestFixture } from './helpers/passingGuestFixture.mjs';
import { readQuranRange } from '../server/services/quranReferenceCache.js';

const database = `nukhab_guest_test_${randomBytes(8).toString('hex')}`;
const {pool,app,linkToken,staffTokens}=await createPassingGuestFixture(database);
const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
let checks=0;
const call=async(path,{staff=staffTokens.manager,token,link,body,method=body===undefined?'GET':'POST'}={})=>{
  const response=await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,
    headers:{'Content-Type':'application/json',...(staff?{Cookie:`nukhab_session=${staff}`} : {}),...(token?{'X-Passing-Session':token}:{}),...(link?{'X-Passing-Link':link}:{})},
    body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
};
const status=(response,expected=200)=>{checks++;assert.equal(response.status,expected,JSON.stringify(response));return response.body;};
const attempt=(mistakeCount=0,previousAttemptId=0)=>({mode:'count',requestId:randomUUID(),previousAttemptId,mistakeCount,warningCount:0,hesitationCount:0});
try {
  const ayahs=await readQuranRange(pool,1,604);
  const range=juz=>{const rows=ayahs.filter(row=>row.juz===juz),first=rows[0],last=rows.at(-1);return [first.page,first.surah,first.ayah,last.page,last.surah,last.ayah];};
  const prior=async(student,juz,planId)=>pool.query(`INSERT INTO ${planId?'student_quran_plan_prior_memorization':'student_quran_prior_memorization'}
    (student_id,${planId?'plan_id,':''}start_page,start_surah,start_ayah,end_page,end_surah,end_ayah) VALUES(?,${planId?'?,':''}?,?,?,?,?,?)`,[student,...(planId?[planId]:[]),...range(juz)]);
  const task=async(student,plan,juz,approved=1)=>{
    const [row]=await pool.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,from_surah,from_ayah,to_page,to_surah,to_ayah,teacher_completed,student_status)
      VALUES(?,?,'2026-10-01','memorization',?,?,?,?,?,?,?,'done')`,[plan,student,...range(juz),approved]);return row.insertId;
  };
  await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,next_memorization_page,next_review_page,status)
    VALUES(21,11,1,604,1,1,114,6,1,1,'completed')`);
  await task(11,21,3);
  await prior(11,4,21);await prior(11,5);
  await pool.query(`INSERT INTO student_quran_prior_memorization(student_id,start_page,start_surah,start_ayah,end_page,end_surah,end_ayah) VALUES(11,102,5,82,102,5,83)`);
  await task(11,11,7,0);
  assert.deepEqual(status(await call('/passing/students/11/parts?type=branch')).parts.map(row=>row.juzNumber),[1,2,3,4,5]);
  assert.deepEqual(status(await call('/passing/students/11/parts?type=hafiz')).parts.map(row=>row.juzNumber),[1,2,3,4,5]);
  for(const juz of [6,7])status(await call('/passing',{body:{studentId:11,type:'branch',juz}}),422);
  const unapproved=await task(13,13,9,0);
  assert.equal(status(await call('/passing/students/13/parts?type=branch')).parts.length,0,'student done alone cannot approve memorization');
  const last=ayahs.filter(row=>row.juz===9).at(-2);
  await pool.query('UPDATE student_quran_tasks SET teacher_completed=1,actual_to_page=?,actual_to_surah=?,actual_to_ayah=? WHERE id=?',[last.page,last.surah,last.ayah,unapproved]);
  assert.equal(status(await call('/passing/students/13/parts?type=branch')).parts.length,0,'actual one-ayah gap remains incomplete');
  await pool.query('UPDATE student_quran_tasks SET actual_to_page=NULL,actual_to_surah=NULL,actual_to_ayah=NULL WHERE id=?',[unapproved]);
  const revoked=status(await call('/passing',{body:{studentId:13,type:'branch',juz:9}}),201);
  await pool.query('UPDATE student_quran_tasks SET teacher_completed=0 WHERE id=?',[unapproved]);
  status(await call(`/passing/parts/${revoked.parts[0].id}/attempts`,{body:attempt()}),422);
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id) VALUES(14,'محفوظ بلا خطة','local-student-14','','',1)");
  await prior(14,30);
  const noPlan=status(await call('/passing',{body:{studentId:14,type:'branch',juz:30}}),201);
  assert.equal(status(await call(`/passing/parts/${noPlan.parts[0].id}/attempts`,{body:attempt()})).result.percentage,100,'prior memorization can be tested without a plan');

  const guest=status(await call('/passing/guest/session',{staff:null,link:linkToken,body:{name:'مقرئ التقرير'}}),201).token;
  for(const options of [{staff:null},{staff:staffTokens.otherAdmin}])status(await call('/passing/students/11/report',options),options.staff?403:401);
  status(await call('/passing/students/12/report',{staff:staffTokens.supervisor}),403);
  status(await call('/passing/students/11/report',{staff:staffTokens.supervisor}));
  status(await call('/passing/students/999999/report'),404);
  for(const path of ['/passing/students/11/report?type=invalid','/passing/students/no-id/report'])status(await call(path),422);
  status(await call('/passing/guest/students/11/report',{staff:null}),401);
  for(const method of ['POST','PUT','DELETE'])status(await call('/passing/guest/students/11/report',{staff:null,token:guest,body:{},method}),403);
  const empty=status(await call('/passing/guest/students/13/report',{token:guest}));
  assert.deepEqual([empty.summary.percentage,empty.summary.rating,empty.summary.testedParts],[null,null,0]);
  const policy=status(await call('/passing/policy')).policy;
  policy.branch.juzOverrides[2]={...policy.branch,maxScore:20,passScore:17,mistakeDeduction:1,juzOverrides:undefined};
  status(await call('/passing/policy',{method:'PUT',body:{policy},staff:staffTokens.admin}),403);
  for(const ratings of [[{label:'',minimumPercentage:95}],[{label:'أ',minimumPercentage:101}], [{label:'أ',minimumPercentage:95},{label:'ب',minimumPercentage:95}],{},null])
    status(await call('/passing/policy',{method:'PUT',body:{policy:{...policy,ratings}}}),422);
  status(await call('/passing/policy',{method:'PUT',body:{policy}}));
  const first=status(await call('/passing/guest/',{token:guest,body:{studentId:11,type:'branch',juz:1}}),201).parts[0];
  const failed=status(await call(`/passing/guest/parts/${first.id}/attempts`,{token:guest,body:attempt(4)})).result;
  assert.deepEqual([failed.percentage,failed.rating,failed.passed],[80,'يحتاج إعادة',false]);
  status(await call(`/passing/guest/parts/${first.id}/rehifz`,{token:guest,body:{attemptId:failed.attemptId,repeat:false}}));
  const passed=status(await call(`/passing/guest/parts/${first.id}/attempts`,{token:guest,body:attempt(1,failed.attemptId)})).result;
  assert.deepEqual([passed.percentage,passed.rating],[95,'ممتاز']);
  const second=status(await call('/passing',{body:{studentId:11,type:'branch',juz:2}}),201).parts[0];
  assert.equal(status(await call(`/passing/parts/${second.id}/attempts`,{body:attempt(4)})).result.percentage,80);
  const hafiz=status(await call('/passing',{body:{studentId:11,type:'hafiz'}}),201).parts.find(row=>row.juzNumber===1);
  const latestPayload=attempt(2);
  const hafizResult=status(await call(`/passing/parts/${hafiz.id}/attempts`,{body:latestPayload})).result;
  assert.equal(hafizResult.percentage,90);
  const report=status(await call('/passing/students/11/report'));
  assert.deepEqual(report.summary,{percentage:85,rating:'جيد',testedParts:2,passedParts:1,attemptCount:4,memorizedParts:5});
  assert.deepEqual(report.parts.map(row=>[row.juzNumber,row.attempts.length,row.latestAttempt.result.percentage]),[[1,3,90],[2,1,80]]);
  assert.equal(report.parts[0].attempts[1].actorName,'مقرئ التقرير');
  assert.deepEqual(status(await call('/passing/guest/students/11/report',{token:guest})),report,'staff and guest see the same report');
  assert.equal(status(await call('/passing/students/11/report?type=branch')).summary.percentage,87.5);
  assert.equal(status(await call('/passing/students/11/report?type=hafiz')).summary.percentage,90);
  const [snapshots]=await pool.query('SELECT id,result_json,policy_json FROM student_passing_attempts ORDER BY id');
  policy.ratings=[{label:'مقياس جديد',minimumPercentage:0}];policy.branch.mistakeDeduction=30;
  status(await call('/passing/policy',{method:'PUT',body:{policy}}));
  assert.deepEqual(status(await call('/passing/students/11/report')),report,'editing settings never re-grades historical reports');
  assert.deepEqual((await pool.query('SELECT id,result_json,policy_json FROM student_passing_attempts ORDER BY id'))[0],snapshots);
  assert.deepEqual(status(await call(`/passing/parts/${hafiz.id}/attempts`,{body:latestPayload})).result,hafizResult,'idempotent replay returns the original frozen rating');
  const legacyPolicy={branch:policy.branch,hafiz:policy.hafiz};
  assert.deepEqual(status(await call('/passing/policy',{method:'PUT',body:{policy:legacyPolicy}})).policy.ratings,policy.ratings,'older clients preserve custom rating bands');
  await pool.query("UPDATE student_passing_attempts SET result_json=JSON_REMOVE(result_json,'$.rating','$.percentage'),policy_json=JSON_REMOVE(policy_json,'$.ratings') WHERE part_id=?",[noPlan.parts[0].id]);
  const legacy=status(await call('/passing/students/14/report'));
  assert.deepEqual([legacy.summary.percentage,legacy.summary.rating,legacy.parts[0].latestAttempt.result.rating],[100,null,null],'legacy grades show a percentage without inventing historical ratings');
  status(await call('/passing/policy',{method:'PUT',body:{policy:{...policy,ratings:[]}}}));
  assert.deepEqual(status(await call('/passing/policy')).policy.ratings,[]);
  globalThis.console.log(`Passing reports real API/MySQL: ${checks} HTTP checks passed; all approved sources, gaps/revocation, no-plan testing, access scope, guest isolation, weighted-scale normalization, latest attempts, historical snapshots and legacy settings verified.`);
} finally {
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await pool.end();
  const connection=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD});
  try{assert.match(database,/^nukhab_guest_test_[a-f0-9]{16}$/);await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);}finally{await connection.end();}
}
