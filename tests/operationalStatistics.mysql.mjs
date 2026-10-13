import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { initDatabase } from '../server/db.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';
import { buildOverviewRankings } from '../server/services/overviewRankings.js';
import { loadBranchPassingOverview } from '../server/services/branchPassingOverview.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

assert.ok(['localhost','127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE,'nukhab_local');
const database=`nukhab_operations_${randomUUID().replaceAll('-','').slice(0,16)}`;
let pool;
try {
  pool=await initDatabase(database,{ seedDefaultData:false });
  const date=getBusinessDate(), from=shiftDateOnly(date,-1), start=shiftDateOnly(date,-5);
  await pool.query("INSERT INTO complexes(id,name) VALUES(1,'Own'),(2,'Other')");
  await pool.query("INSERT INTO committees(id,name,complex_id) VALUES(1,'Own',1),(2,'Other',2)");
  for(const id of [7,8]) await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role,created_at) VALUES(?,'Test',?,'','','','supervisor',?)",[id,`operations-${id}`,start]);
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1),(8,2)');
  for(const id of [1,2,3,4,5,6]) {
    await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES(?,'Test',?,'','',?,?)",[id,`operations-${id}`,id===6?2:1,start]);
    await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status,reading_faces) VALUES(?,?,?,1,604,1,1,114,6,22,1,'active',?)`,[id,id,start,id===5?10:0]);
  }
  await pool.query("INSERT INTO attendance_records(student_id,record_date,status) VALUES(1,?,'present'),(2,?,'present'),(3,?,'absent'),(4,?,'excused'),(5,?,'late'),(6,?,'present')",Array(6).fill(date));
  await pool.query("INSERT INTO supervisor_attendance_records(supervisor_id,record_date,status) VALUES(7,?,'late'),(7,?,'excused')",[from,date]);
  const task=async(id,type='memorization',day=date,approved=null,endSurah=1,endAyah=7)=>{
    const [result]=await pool.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages,teacher_completed)
      VALUES(?,?,?, ?,1,?,1,1,?,?,1,?)`,[id,id,day,type,endSurah===2?21:1,endSurah,endAyah,approved]);
    return result.insertId;
  };
  const record=async(taskId,studentId,evaluator=7)=>pool.query(`INSERT INTO student_quran_recitation_attempts(task_id,student_id,evaluator_id,session_date,attempt_number,teacher_completed,is_official)
    VALUES(?,?,?, ?,1,0,1)`,[taskId,studentId,evaluator,date]);
  await record(await task(1),1); await record(await task(1,'review'),1);
  await record(await task(2),2); const pending=await task(2,'review');
  await task(3); await task(4);
  await record(await task(6),6,8);
  await pool.query('INSERT INTO student_quran_prior_memorization(student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah) VALUES(5,1,21,1,1,2,141)');
  await pool.query(`INSERT INTO student_daily_grades(student_id,grade_date,component,grade,max_grade,passed,policy_json,recorded_by_role,recorded_by_id)
    VALUES(5,?,'reading',0,1,0,'{}','supervisor',7)`,[date]);
  for(const id of [1,2,3,6]) await task(id,'memorization',start,1,2,141);
  await task(4,'memorization',start,1,2,140);
  const exam=async(studentId,type,day)=>{
    const [exam]=await pool.query("INSERT INTO student_passing_exams(student_id,exam_type,created_by_role,created_by_id) VALUES(?,?,'supervisor',7)",[studentId,type]);
    const [part]=await pool.query("INSERT INTO student_passing_parts(exam_id,juz_number,ranges_json) VALUES(?,1,'[]')",[exam.insertId]);
    await pool.query(`INSERT INTO student_passing_attempts(part_id,request_id,evaluation_mode,result_json,policy_json,marks_json,actor_role,actor_id,actor_name,created_at)
      VALUES(?,?,'count','{"passed":false}','{}','[]','supervisor',7,'Test',?)`,[part.insertId,randomUUID(),`${day} 12:00:00`]);
    return part.insertId;
  };
  const branchPart=await exam(2,'branch',date); await exam(1,'hafiz',date); await exam(3,'branch',start);
  const scope=createOverviewReportScope(pool,{ auth:{ role:'supervisor',id:7 } });
  const options={ from,to:date,attendanceDates:[from,date],readingDays:[0,1,2,3,4,5,6] };
  let report=await buildOverviewRankings(scope,options);
  assert.equal(report.teachers.length,1);
  assert.deepEqual(report.teachers[0].attendance,{ attended:1,late:1,absent:0,excused:1,expected:1,percentage:100 });
  assert.deepEqual(report.teachers[0].achievement,{ completed:2,expected:3,percentage:67 });
  await record(pending,2,8);
  assert.equal((await buildOverviewRankings(scope,options)).teachers[0].achievement.completed,2,'another teacher cannot complete this teachers personal record');
  await pool.query('UPDATE student_quran_recitation_attempts SET evaluator_id=7 WHERE task_id=?',[pending]);
  assert.equal((await buildOverviewRankings(scope,options)).teachers[0].achievement.percentage,100,'failed grades still count as recorded');
  const weekDay=new Date(`${date}T00:00:00Z`).getUTCDay();
  const friday=shiftDateOnly(date,-((weekDay+2)%7)-7), saturday=shiftDateOnly(friday,1);
  await pool.query('UPDATE student_quran_plans SET start_date=? WHERE id=5',[shiftDateOnly(date,-14)]);
  await pool.query('UPDATE supervisors SET created_at=? WHERE id=7',[shiftDateOnly(date,-14)]);
  await pool.query("INSERT INTO attendance_records(student_id,record_date,status) VALUES(5,?,'present'),(5,?,'present')",[friday,saturday]);
  await pool.query("INSERT INTO supervisor_attendance_records(supervisor_id,record_date,status) VALUES(7,?,'absent'),(7,?,'absent')",[friday,saturday]);
  const programOnly=await buildOverviewRankings(scope,{ ...options,from:friday,readingDays:[5,6] });
  assert.equal(programOnly.teachers[0].attendance.percentage,100,'weekend absence does not reduce program attendance');
  assert.deepEqual(programOnly.teachers[0].achievement,{ completed:2,expected:2,percentage:100 },'weekend self reading adds no teacher recording obligation');
  let passing=await loadBranchPassingOverview(scope,{ from,to:date,referenceConnection:pool });
  assert.deepEqual([passing.expected,passing.tested,passing.percentage],[2,1,50]);
  assert.deepEqual(passing.studentsList.map(row=>row.id),[1,2]);
  await pool.query(`INSERT INTO student_passing_attempts(part_id,request_id,evaluation_mode,result_json,policy_json,marks_json,actor_role,actor_id,actor_name,created_at)
    VALUES(?,?,'count','{"passed":true}','{}','[]','supervisor',7,'Test',?)`,[branchPart,randomUUID(),`${date} 13:00:00`]);
  passing=await loadBranchPassingOverview(scope,{ from,to:date,referenceConnection:pool });
  assert.deepEqual([passing.expected,passing.tested],[2,1],'retries do not inflate the student count');
  for(const filters of [{ auth:{ role:'supervisor',id:9 } },{ auth:{ role:'supervisor',id:7 },complexId:2 },{ auth:{ role:'supervisor',id:7 },committeeId:2 }]) {
    const denied=createOverviewReportScope(pool,filters);
    assert.deepEqual((await buildOverviewRankings(denied,options)).teachers,[]);
    assert.equal((await loadBranchPassingOverview(denied,{ from,to:date,referenceConnection:pool })).expected,0);
  }
  await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES('seasonalHolidays',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify([{ startDate:date,endDate:date }])]);
  report=await buildOverviewRankings(scope,{ ...options,attendanceDates:[from] });
  assert.equal(report.teachers[0].achievement.percentage,null,'holiday has no recording obligation');
  globalThis.console.log('Operational statistics MySQL passed: personal attendance/excuses, student-day completion, partial/missing/failed/other-teacher outcomes, self reading, holidays, full current-plan branch eligibility, distinct tested students, hafiz exclusion, periods and scope isolation.');
} finally {
  await pool?.end();
  const connection=await mysql.createConnection({ host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT || 3306),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD });
  try { assert.match(database,/^nukhab_operations_[a-f0-9]{16}$/); await connection.query('DROP DATABASE IF EXISTS ??',[database]); }
  finally { await connection.end(); }
}
