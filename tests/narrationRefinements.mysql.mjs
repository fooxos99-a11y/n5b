import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import mysql from 'mysql2/promise';
import { URL } from 'node:url';

// All route SQL targets connection-local temporary tables, never application records.
assert.ok(['127.0.0.1','localhost'].includes(process.env.MYSQL_HOST || '127.0.0.1'));
assert.equal(process.env.MYSQL_DATABASE,'nukhab_local');
const connection = await mysql.createConnection({host:process.env.MYSQL_HOST || '127.0.0.1',port:Number(process.env.MYSQL_PORT || 3306),user:process.env.MYSQL_USER || 'root',password:process.env.MYSQL_PASSWORD || '',database:'nukhab_local',decimalNumbers:true});
const scoped = {
  query:(sql,params)=>connection.query(sql.replace(/\bnarration_(events|event_students|event_parts|event_reciters)\b/g,'audit_$&'),params),
  beginTransaction:()=>connection.beginTransaction(),commit:()=>connection.commit(),rollback:()=>connection.rollback(),release:()=>{},
};
try {
  for (const table of ['narration_events','narration_event_students','narration_event_parts','narration_event_reciters']) await connection.query(`CREATE TEMPORARY TABLE audit_${table} LIKE ${table}`);
  await scoped.query("INSERT INTO narration_events (id,name,start_date,end_date,created_by_role,created_by_name) VALUES (7,'تجربة','2026-09-29','2026-09-29','manager','مدير التجربة')");
  await scoped.query("INSERT INTO narration_event_students (id,event_id,student_id,student_name,committee_id) VALUES (11,7,100,'طالب التجربة',5),(12,7,101,'طالب آخر',5)");
  await scoped.query('INSERT INTO narration_event_parts (id,event_student_id,juz_number,start_surah,start_ayah,start_page,end_surah,end_ayah,end_page) VALUES (51,11,1,1,1,1,2,5,2),(52,11,1,2,10,3,2,20,4),(53,11,2,2,142,22,2,150,23),(54,12,1,1,1,1,2,5,2)');
  const source=await readFile(new URL('../server/index.js',import.meta.url),'utf8');
  const routes=new Map(), pointWrites=[];
  let allow=true;
  const context=vm.createContext({
    app:{put:(path,_guard,handler)=>routes.set(path,handler),post:(path,_guard,handler)=>routes.set(path,handler)},requireNarrationAccess:()=>{},
    db:()=>({getConnection:async()=>scoped}),canAccessNarrationCommittee:async()=>allow,
    loadSettings:async()=>({narrationMaxScore:100,narrationWarningDeduction:1,narrationMistakeDeduction:2}),
    syncNarrationGradePoints:async(_db,id,score)=>pointWrites.push({id,score}),getNarrationRating:score=>String(score),
    getNarrationEvent:async()=>null,isMistakeMark:type=>['mistake','lahn'].includes(type),
  });
  vm.runInContext(source.slice(source.indexOf('async function refreshNarrationStudentResult('),source.indexOf("app.post('/api/narration-events/:id/archive'")),context);
  const invoke=async(path,params,body,auth={role:'manager',id:1,name:'أحمد المدير'})=>{
    let result,status=200;
    const res={status:code=>{status=code;return res;},json:value=>{result=value;}};
    await routes.get(path)({params,body,auth},res,error=>{throw error;});
    return {status,result};
  };
  const grading='/api/narration-events/:eventId/students/:studentEntryId/juz/:juzNumber';
  const start='/api/narration-events/:eventId/students/:studentEntryId/status';
  const params={eventId:7,studentEntryId:11,juzNumber:1};
  assert.equal((await invoke(grading,params,{evaluationMode:'count',warningCount:1,mistakeCount:2})).status,200);
  let [[entry]]=await scoped.query('SELECT status,final_score FROM narration_event_students WHERE id=11');
  assert.deepEqual(entry,{status:'in_progress',final_score:95});
  const [parts]=await scoped.query('SELECT id,score,evaluated_by_name FROM narration_event_parts ORDER BY id');
  assert.deepEqual(parts.map(part=>part.score),[95,95,null,null]);
  assert.equal(parts[0].evaluated_by_name,'أحمد المدير');
  assert.equal(pointWrites.at(-1).score,null);
  assert.equal((await invoke(grading,{...params,eventId:99},{evaluationMode:'count'})).status,404);
  allow=false;
  assert.equal((await invoke(grading,params,{evaluationMode:'count'})).status,403);
  allow=true;
  await invoke(grading,{...params,juzNumber:2},{evaluationMode:'count',warningCount:0,mistakeCount:5});
  assert.equal(pointWrites.at(-1).score,92.5);
  for(const auth of [{role:'manager',id:1,name:'أحمد المدير'},{role:'supervisor',id:2,name:'محمد المعلم'}]) await invoke(start,params,{status:'in_progress'},auth);
  [[entry]]=await scoped.query('SELECT status,final_score FROM narration_event_students WHERE id=11');
  assert.deepEqual(entry,{status:'completed',final_score:92.5});
  const [names]=await scoped.query('SELECT actor_name FROM narration_event_reciters ORDER BY actor_id');
  assert.deepEqual(names.map(row=>row.actor_name),['أحمد المدير','محمد المعلم']);
  assert.equal((await invoke(start,params,{status:'absent'})).status,422);
  context.getNarrationEvent=async()=>({id:7,status:'open',students:[{id:11,committeeId:5,status:'completed'},{id:12,committeeId:5,status:'pending'}]});
  let deliveryStarted=false;
  context.sendNarrationMessages=()=>{deliveryStarted=true;return new Promise(()=>{});};
  vm.runInContext(source.slice(source.indexOf('function summarizeNarrationStudents('),source.indexOf('async function canAccessNarrationCommittee(')),context);
  vm.runInContext(source.slice(source.indexOf("app.post('/api/narration-events/:id/archive'"),source.indexOf("app.post('/api/narration-events/:id/send'")),context);
  const archived=await invoke('/api/narration-events/:id/archive',{id:7},{});
  assert.equal(archived.result.archivedAll,true);
  assert.equal(deliveryStarted,true);
  assert.equal(archived.result.archiveSummary.pending,undefined);
  assert.equal(archived.result.archiveSummary.absent,undefined);
  assert.equal(archived.result.archiveSummary.excused,undefined);
  assert.equal((await invoke(grading,params,{evaluationMode:'count'})).status,404);
  globalThis.console.log('MySQL narration passed: partial/full grades, correct event/student/juz, preserved scores on restart, authenticated names, permissions and archived write rejection.');
} finally {await connection.end();}
