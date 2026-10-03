import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import { up as renameSupervisorTitle } from '../server/migrations/2026.10.02.5-supervisor-display-name.js';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';
import { loadTeacherReading, saveTeacherReading } from '../server/services/selfReading.js';
import { saveGradingPolicy } from '../server/services/grading.js';
import { runRecitationSessionTransaction } from '../server/services/recitationSessionTransaction.js';

assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_evaluation_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
const testModule = new URL(`../server/.evaluation-test-${randomUUID()}.js`, import.meta.url);
let pool;
try {
  // Use the actual handlers with only the external server startup removed.
  const source = (await readFile(new URL('../server/index.js', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const start = source.indexOf('try {\n    await initDatabase();');
  assert.ok(start > 0);
  const end = source.indexOf('\n}', source.indexOf('    process.exit(1);', start)) + 2;
  assert.ok(end > start);
  await writeFile(testModule, source.slice(0, start) + source.slice(end)
    + '\nexport { ensureStudentPlanTasks, getActivePlanForStudent, loadSettings, runRecitationTaskHandler, buildRecitationSessionsReport };\n');
  const handlers = await import(testModule.href);
  pool = await initDatabase(database, { seedDefaultData: false });
  await runWithDatabase(database, {}, async () => {
    const date = getBusinessDate();
    await pool.query("INSERT INTO app_settings (setting_key,setting_value) VALUES ('teacherMemorizationRecitationMode','count') ON DUPLICATE KEY UPDATE setting_value='count'");
    await saveGradingPolicy(pool,{generalMargin:0,weeklyProgram:{workDays:[0,1,2,3,4,5,6]}});
    await pool.query("INSERT INTO committees (id,name) VALUES (1,'Evaluation test')");
    await pool.query("INSERT INTO supervisors (id,name,login_number,national_id,phone,job_title) VALUES (7,'Test','evaluation-test','','','')");
    await pool.query("UPDATE supervisors SET job_title=? WHERE id=7",['معلم']);
    await renameSupervisorTitle(pool);
    const [[staff]] = await pool.query('SELECT id,name,job_title AS title FROM supervisors WHERE id=7');
    assert.deepEqual(staff,{id:7,name:'Test',title:'مشرف المسار'});
    await pool.query('INSERT INTO supervisor_committees (supervisor_id,committee_id) VALUES (7,1)');
    await pool.query("INSERT INTO students (id,name,login_number,national_id,guardian_phone,committee_id) VALUES (3,'Test','evaluation-test','','',1)");
    await pool.query(`INSERT INTO student_quran_plans (id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status,reading_faces) VALUES (1,3,?,1,604,1,1,114,6,12,1,'active',10)`, [date]);
    const [[last]] = await pool.query('SELECT surah_number AS surah,ayah_number AS ayah FROM quran_ayah_pages WHERE page_number=10 ORDER BY surah_number DESC,ayah_number DESC LIMIT 1');
    await pool.query(`INSERT INTO student_quran_prior_memorization (student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah)
      VALUES (3,1,10,1,1,?,?)`, [last.surah,last.ayah]);
    const entry = (await loadTeacherReading(pool, { supervisorId: 7, date })).students[0];
    assert.equal(entry.amount.faces,10);
    assert.equal(entry.amount.ranges[0].startPage,1);
    assert.equal(entry.amount.ranges.at(-1).endPage,10);
    const reading = { supervisorId:7,studentId:3,date,completed:true,faces:604,fromHizb:60,toHizb:60,actor:{role:'supervisor',id:7} };
    await saveTeacherReading(pool,reading); await saveTeacherReading(pool,reading);
    const [[saved]] = await pool.query("SELECT detail_json AS detail FROM student_daily_grades WHERE student_id=3 AND component='reading'");
    const detail = typeof saved.detail === 'string' ? JSON.parse(saved.detail) : saved.detail;
    assert.equal(detail.requiredFaces,10); assert.equal(detail.ranges.at(-1).endPage,10);
    assert.equal(await saveTeacherReading(pool,{...reading,supervisorId:8}),null);
    await assert.rejects(saveTeacherReading(pool,{...reading,date:shiftDateOnly(date,1)}),{status:422});
    const [[ledger]] = await pool.query("SELECT COUNT(*) AS count FROM student_point_transactions WHERE source_type='grade'");
    assert.equal(Number(ledger.count),1);

    await pool.query("INSERT INTO attendance_records (student_id,record_date,status) VALUES (3,?,'present')",[date]);
    await handlers.ensureStudentPlanTasks(pool,await handlers.getActivePlanForStudent(pool,3),date,await handlers.loadSettings());
    const [[task]] = await pool.query("SELECT id FROM student_quran_tasks WHERE student_id=3 AND task_type='memorization' AND task_date=? LIMIT 1",[date]);
    assert.ok(task);
    const sourceRequest = {auth:{role:'supervisor',id:7,name:'Test'}};
    const submit = (payload, auth = sourceRequest) => runRecitationSessionTransaction(pool, async (connection,transaction) => {
      const sessionId = randomUUID();
      const result = await handlers.runRecitationTaskHandler(auth,{id:'7',taskId:String(task.id)}, {
        sessionId,requestId:`${sessionId}:${task.id}`,date,evaluationMode:'count',mistakeCount:0,warningCount:0,...payload,
      },[task.id],connection,transaction);
      transaction.failed=result.statusCode!==200;
      return result;
    }).then(({value})=>value);
    for (const hesitationCount of [-1,1.5,1001,'bad']) assert.equal((await submit({hesitationCount})).statusCode,422);
    assert.equal((await submit({hesitationCount:2},{auth:{role:'supervisor',id:8,name:'Other'}})).statusCode,403);
    const result=await submit({hesitationCount:2});
    assert.equal(result.statusCode,200,JSON.stringify(result));
    const [[evaluation]] = await pool.query('SELECT hesitation_count AS count,evaluation_hesitation_deduction AS deduction,evaluation_score AS score FROM student_quran_tasks WHERE id=?',[task.id]);
    assert.equal(Number(evaluation.count),2);assert.equal(Number(evaluation.deduction),0);assert.equal(Number(evaluation.score),100);
    const [[attempt]] = await pool.query('SELECT hesitation_count AS count FROM student_quran_recitation_attempts WHERE task_id=?',[task.id]);
    assert.equal(Number(attempt.count),2);
    const report=await handlers.buildRecitationSessionsReport({from:date,to:date,studentId:3,auth:sourceRequest.auth});
    assert.ok(report.rows.some(row=>Number(row.hesitationCount)===2));
    console.log('Isolated MySQL passed: automatic memorized reading, idempotent grade/points, scope/date guards; real recitation count validation, persisted task/attempt counts and report.');
  });
} finally {
  await unlink(testModule).catch(error=>{if(error.code!=='ENOENT')throw error;});
  await pool?.end();
  const connection = await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT)||3306,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD});
  try {assert.match(database,/^nukhab_evaluation_[a-f0-9]{16}$/);await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);}finally{await connection.end();}
}
