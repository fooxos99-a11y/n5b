import { forecastQuranPlan } from '../server/services/quranPlanForecast.js';
import { loadCompensatedPlanRanges, uncompensatedTaskSql } from '../server/services/compensationPlanCredit.js';
import { expireQuranTasks } from '../server/services/expireQuranTasks.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';
import { loadCompensationAudit } from '../server/services/compensationReports.js';
import '../server/loadEnvironment.js';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mysql from 'mysql2/promise';
import { db, initDatabase, runWithDatabase } from '../server/db.js';
import { register } from 'node:module';
import { URL } from 'node:url';
import { createGradingRouter } from '../server/routes/gradingRoutes.js';
import { getSupervisorDashboardPermissions } from '../server/services/dashboardPermissions.js';
import { assertAdministratorScope } from '../server/services/administratorScope.js';
import { saveGradingPolicy, loadGradingPolicyForDate, recordAttendanceGrade, upsertDailyGrade, deleteDailyGrade } from '../server/services/grading.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

register(new URL('./fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
const { authorizeApiRequest, getDashboardPermissionKeysForRequest, app: dashboardApp } = await import('../server/index.js');

assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_permissions_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server;
const date = getBusinessDate(), start = shiftDateOnly(date, -14);
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'Test own'),(2,'Test other')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'مشرف اختبار','permissions-test','','','','supervisor'),(8,'Admin test','permissions-admin','','','','admin')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1)');
  for (const [id, committeeId] of [[3,1],[4,1],[5,1],[6,1],[9,2],[10,1]]) {
    await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id,created_at) VALUES(?,'Test student',?,'','',?,?)", [id, `permissions-${id}`, committeeId, start]);
    if (id !== 10) await pool.query(`INSERT INTO student_quran_plans(student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status,reading_faces) VALUES(?,?,1,604,1,1,114,6,1,1,'active',10)`, [id,start]);
  }
  const sessionDay = new Date(`${date}T00:00:00Z`).getUTCDay();
  const policy = await saveGradingPolicy(pool, { generalMargin: 0, trackSession: { sessionDay, attendance: 5, attendanceExcused: 1, attendanceLate: 2, segmentCount: 1, segmentMax: 1 }, weeklySession: { sessionDay, attendance: 0 }, weeklyProgram: { workDays: [0,1,2,3,4,5,6], readingDays: [0,1,2,3,4,5,6], memorizationDaily: 1.5, linkDaily: 2, reviewDaily: 3, readingDaily: 4 } });
  const actor = { role: 'manager', id: 1, name: 'Test manager' };
  for (const [id,status] of [[3,'absent'],[4,'excused'],[5,'late'],[6,'present']]) {
    await pool.query('INSERT INTO attendance_records(student_id,record_date,status,points) VALUES(?,?,?,?)', [id,date,status,id / 10]);
    await recordAttendanceGrade(pool, { studentId: id, date, status, actor });
  }
  const app = express(); app.use(express.json());
  app.use((req,res,next) => {
    req.auth = { role: req.get('x-test-role') || 'supervisor', id: Number(req.get('x-test-id') || 7), name: 'مشرف اختبار' };
    return runWithDatabase(database, {}, next);
  });
  app.use(authorizeApiRequest);
  app.use('/grading', createGradingRouter({ db, today: () => date }));
  for(const [method,path] of [['post','/supervisors'],['put','/supervisors/:id'],['delete','/supervisors/:id'],['get','/reports/archives'],['get','/reports/supervisors'],['get','/reports/whatsapp-recipients']]) {
    const route=dashboardApp.router.stack.find(item=>item.route?.path===`/api${path}`&&item.route.methods[method]).route;
    app[method](path,...route.stack.map(item=>item.handle));
  }
  app.get('/students/:id', (_req,res) => res.json({ok:true}));
  app.use((error,_req,res,next) => { if(res.headersSent)return next(error); return res.status(error.statusCode || error.status || 500).json({ message: error.message }); });
  server = await new Promise(resolve => { const listener=app.listen(0,'127.0.0.1',()=>resolve(listener)); });
  const request = async (path, body, { role='supervisor', id=7, method=body ? 'POST' : 'GET' }={}) => {
    const res = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, {method,
      headers:{'content-type':'application/json','x-test-role':role,'x-test-id':String(id)}, ...(body ? {body:JSON.stringify(body)} : {})});
    return {status:res.status, body:await res.json()};
  };
  const compensate = (studentId, compensatedDate=date, options={}) => request('/grading/program-compensation', {studentId,date:compensatedDate,excuseReference:'استئذان معتمد رقم 123'},options);
  await runWithDatabase(database,{},async()=> {
    assert.deepEqual(new Set(await getSupervisorDashboardPermissions(7)), new Set(['quranEvaluation','studentPlans','calls','reports']));
    assert.equal((await request('/grading/track-compensation',{studentId:3,date,excuseReference:'استئذان معتمد'})).status,403);
    assert.equal((await request('/grading/track-compensation-days?studentId=3')).status,403);
    assert.equal((await request('/reports/archives')).status,403);
    assert.equal((await request('/reports/whatsapp-recipients')).status,403);
    assert.equal((await request('/reports/supervisors')).status,200);
    assert.ok((await request('/reports/supervisors')).body.every(person=>Number(person.id)===7));
    await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(7,'weeklySession')");
    assert.equal((await request('/grading/track-compensation',{studentId:3,date,excuseReference:'استئذان معتمد'})).status,403);
    assert.equal((await request('/grading/track-test',{studentId:3,weekStart:date})).status,403);
    assert.equal((await request('/grading/policy',{policy}, {method:'PUT'})).status,403);
    await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(7,'trackSession'),(7,'students')");
    assert.equal((await request('/students/3')).status,200);
    assert.equal((await request('/students/9')).status,403);
    assert.equal((await compensate(9)).status,403);
    assert.equal((await compensate(3,date,{role:'student',id:3})).status,403);
    assert.equal((await compensate(3,shiftDateOnly(date,1))).status,422);
    assert.equal((await compensate(3,start+'bad')).status,422);
    assert.equal((await compensate(10)).status,422);
    assert.equal((await request('/grading/program-compensation',{studentId:3,date,excuseReference:''})).status,422);
    assert.equal((await compensate(3)).status,422);
    assert.equal((await request('/grading/excuse-approval',{studentId:3,date,excuseReference:'استئذان معتمد رقم 123'})).status,403);
    for (const studentId of [3,5,6]) assert.equal((await request('/grading/excuse-approval',{studentId,date,excuseReference:'استئذان معتمد رقم 123'},{role:'manager',id:1})).status,201);
    assert.equal((await request('/grading/program-compensation-days?studentId=9')).status,403);
    assert.equal((await request('/grading/program-compensation-days?studentId=3',null,{role:'student',id:3})).status,403);
    assert.deepEqual((await request('/grading/program-compensation-days?studentId=10')).body.days,[]);
    const earlierDay=shiftDateOnly(date,-7), beforePlan=shiftDateOnly(start,-7), wrongDay=shiftDateOnly(date,-1);
    for (const excusedDate of [earlierDay,beforePlan,wrongDay]) await pool.query("INSERT INTO attendance_records(student_id,record_date,status,points) VALUES(4,?,'excused',0)",[excusedDate]);
    assert.deepEqual((await request('/grading/program-compensation-days?studentId=4')).body.days.map(day=>day.date),[earlierDay,date]);
    assert.equal((await compensate(4,wrongDay)).status,422);
    await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES('seasonalHolidays',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify([{startDate:earlierDay,endDate:earlierDay}])]);
    assert.deepEqual((await request('/grading/program-compensation-days?studentId=4')).body.days.map(day=>day.date),[date]);
    await pool.query("DELETE FROM app_settings WHERE setting_key='seasonalHolidays'");
    await pool.query(`INSERT INTO student_quran_plans(student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status,reading_faces) VALUES(10,?,1,604,1,1,114,6,1,1,'active',10)`,[date]);
    assert.equal((await request('/grading/weekly-component',{studentId:10,weekStart:date,component:'weekly',attendanceStatus:'excused'},{method:'PUT'})).status,200);
    const [weeklyBefore]=await pool.query("SELECT * FROM student_weekly_components WHERE student_id=10 AND component='weekly'");
    assert.deepEqual((await request('/grading/program-compensation-days?studentId=10')).body.days,[{date,dayNumber:1}]);
    assert.equal((await compensate(10)).status,201);
    const [weeklyAfter]=await pool.query("SELECT * FROM student_weekly_components WHERE student_id=10 AND component='weekly'");
    assert.deepEqual(weeklyAfter,weeklyBefore);
    const [[dailyAttendanceCount]]=await pool.query("SELECT COUNT(*) AS count FROM student_daily_grades WHERE student_id=10 AND component='attendance'");
    assert.equal(Number(dailyAttendanceCount.count),0);
    const attendanceSnapshot = async id => {
      const [attendance] = await pool.query('SELECT * FROM attendance_records WHERE student_id=? AND record_date=?',[id,date]);
      const [grades] = await pool.query("SELECT * FROM student_daily_grades WHERE student_id=? AND grade_date=? AND component='attendance'",[id,date]);
      const [ledger] = await pool.query('SELECT * FROM student_point_transactions WHERE dedupe_key=?',[`grade:daily:${id}:${date}:attendance`]);
      return {attendance,grades,ledger};
    };
    const [[studentPlan]] = await pool.query('SELECT id FROM student_quran_plans WHERE student_id = 3');
    await pool.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages)
      VALUES(?,3,?,'memorization',1,1,1,1,1,7,0.5)`,[studentPlan.id,date]);
    for (const id of [3,4,5,6]) {
      const before=await attendanceSnapshot(id);
      if (id===3) {
        const concurrent=await Promise.all([compensate(id),compensate(id)]);
        assert.deepEqual(concurrent.map(row=>row.status).sort(),[201,409]);
      } else assert.equal((await compensate(id)).status,201);
      assert.deepEqual(await attendanceSnapshot(id),before);
      assert.equal((await compensate(id)).status,409);
      assert.ok(!(await request(`/grading/program-compensation-days?studentId=${id}`)).body.days.some(day=>day.date===date));
      const [grades]=await pool.query("SELECT component,grade,max_grade AS maxGrade,detail_json AS detail FROM student_daily_grades WHERE student_id=? AND grade_date=? AND component<>'attendance'",[id,date]);
      assert.equal(grades.length,4);
      assert.equal(grades.reduce((sum,row)=>sum+Number(row.grade),0),10.5);
      for(const grade of grades) { assert.equal(grade.grade,grade.maxGrade); assert.equal((typeof grade.detail==='string' ? JSON.parse(grade.detail) : grade.detail).operationType,'compensation'); }
      const [[audit]]=await pool.query('SELECT * FROM student_day_compensations WHERE student_id=?',[id]);
      assert.equal(Number(audit.actor_id),7);assert.equal(audit.actor_role,'supervisor');assert.equal(audit.actor_name,'مشرف اختبار');
      assert.equal(audit.excuse_reference,'استئذان معتمد رقم 123');assert.ok(audit.recorded_at);assert.equal(audit.attendance_status,before.attendance[0].status);
      const [[ledger]]=await pool.query("SELECT COUNT(*) AS count,SUM(points) AS points FROM student_point_transactions WHERE student_id=? AND dedupe_key LIKE ? AND dedupe_key NOT LIKE '%:attendance'",[id,`grade:daily:${id}:${date}:%`]);
      assert.equal(Number(ledger.count),4);assert.equal(Number(ledger.points),10.5);
    }
    const credit = await loadCompensatedPlanRanges(pool, {studentId:3,planId:studentPlan.id,throughDate:date});
    assert.equal(credit.length,1);
    const actualReportRows = async () => {
      const [[row]] = await pool.query(`SELECT COUNT(*) AS count FROM student_quran_tasks t WHERE t.student_id = 3 AND ${uncompensatedTaskSql('t', { retainAccepted: true })}`);
      return Number(row.count);
    };
    assert.equal(await actualReportRows(), 0);
    await pool.query('UPDATE student_quran_tasks SET teacher_completed = 1 WHERE student_id = 3');
    assert.equal(await actualReportRows(), 1);
    await pool.query('UPDATE student_quran_tasks SET teacher_completed = NULL WHERE student_id = 3');
    const forecastOptions={plan:{id:studentPlan.id,startDate:date,startSurah:1,startAyah:1,endSurah:1,endAyah:7,dailyPages:0.25},today:date,workDays:[0,1,2,3,4,5,6]};
    const delayed=await forecastQuranPlan(pool,{...forecastOptions,acceptedRanges:[]});
    const credited=await forecastQuranPlan(pool,{...forecastOptions,acceptedRanges:credit});
    assert.equal(credited.delayedFaces,0);assert.equal(credited.remainingFaces,0);assert.equal(credited.projectedEndDate,date);assert.equal(credited.baseEndDate,delayed.baseEndDate);
    await expireQuranTasks(pool,shiftDateOnly(date,1));
    const [[protectedTask]]=await pool.query('SELECT student_status AS status,teacher_completed AS completed FROM student_quran_tasks WHERE student_id=3');
    assert.equal(protectedTask.status,'pending');assert.equal(protectedTask.completed,null);
    assert.equal((await request('/grading/weekly-component',{studentId:3,weekStart:date,component:'track',attendanceStatus:'excused',segments:[]},{method:'PUT'})).status,200);
    const trackCompensate=()=>request('/grading/track-compensation',{studentId:3,date,excuseReference:'استئذان معتمد رقم 123'});
    const trackResult=await trackCompensate();assert.equal(trackResult.status,201);
    const readTrack=async()=>{const [[row]]=await pool.query("SELECT grade,attended,detail_json AS detail FROM student_weekly_components WHERE student_id=3 AND component='track'");return {...row,detail:typeof row.detail==='string'?JSON.parse(row.detail):row.detail};};
    assert.equal((await readTrack()).grade,2);assert.equal((await readTrack()).detail.attendanceGrade,1);assert.equal((await readTrack()).attended,0);
    assert.equal((await trackCompensate()).status,409);
    assert.equal((await request('/grading/track-test',{studentId:3,weekStart:date})).status,409);
    assert.equal((await request('/grading/weekly-component',{studentId:3,weekStart:date,component:'track',attendanceStatus:'absent',segments:[]},{method:'PUT'})).status,200);
    assert.equal((await readTrack()).grade,1);assert.equal((await readTrack()).detail.attendanceGrade,0);
    const cancelPath=`/grading/compensations/${trackResult.body.result.id}/cancel`;
    assert.equal((await request(cancelPath,{reason:'تصحيح إداري'})).status,403);
    assert.equal((await request(cancelPath,{reason:'تصحيح إداري'},{role:'manager',id:1})).status,200);
    assert.equal((await readTrack()).grade,0);assert.equal((await readTrack()).detail.attendanceStatus,'absent');
    assert.equal((await request(cancelPath,{reason:'تصحيح إداري'},{role:'manager',id:1})).status,409);
    const replacement=await trackCompensate();assert.equal(replacement.status,201);
    assert.equal((await request(`/grading/compensations/${replacement.body.result.id}/cancel`,{reason:'إلغاء البديل'},{role:'manager',id:1})).status,200);
    const noAttendance=await request('/grading/track-compensation',{studentId:4,date,excuseReference:'استئذان رسمي'});assert.equal(noAttendance.status,201);
    const [[missingAttendance]]=await pool.query("SELECT detail_json AS detail FROM student_weekly_components WHERE student_id=4 AND component='track'");
    assert.equal((typeof missingAttendance.detail==='string'?JSON.parse(missingAttendance.detail):missingAttendance.detail).attendanceRecorded,false);
    assert.equal((await request(`/grading/compensations/${noAttendance.body.result.id}/cancel`,{reason:'إلغاء إداري'},{role:'manager',id:1})).status,200);
    const [[programAudit]]=await pool.query("SELECT id FROM student_day_compensations WHERE student_id=3 AND scope='program' AND cancelled_at IS NULL");
    assert.equal((await request(`/grading/compensations/${programAudit.id}/cancel`,{reason:'تصحيح اليوم'},{role:'manager',id:1})).status,200);
    assert.equal((await loadCompensatedPlanRanges(pool,{studentId:3,planId:studentPlan.id,throughDate:date})).length,0);
    const [[restored]]=await pool.query("SELECT COUNT(*) AS count FROM student_daily_grades WHERE student_id=3 AND component<>'attendance'");assert.equal(Number(restored.count),0);
    assert.equal((await compensate(3)).status,201);
    const scopedAudit=await loadCompensationAudit(createOverviewReportScope(pool,{auth:{role:'supervisor',id:7}}),start,date);
    assert.ok(scopedAudit.some(row=>row.cancelledAt&&row.cancelledByName));assert.ok(scopedAudit.every(row=>row.studentId!==9));
    const frozen=await loadGradingPolicyForDate(pool,date);
    await assert.rejects(upsertDailyGrade(pool,{studentId:3,date,result:{component:'memorization',grade:0,max:1.5,passed:false},policy:frozen,actor}),{status:409});
    await assert.rejects(deleteDailyGrade(pool,{studentId:3,date,component:'reading',actor}),{status:409});
    const week=await request('/grading/week');assert.equal(week.status,200);assert.ok(week.body.students.every(student=>student.id!==9));
    assert.equal(week.body.students.find(student=>student.id===3).compensations.filter(row=>row.scope==='program'&&!row.cancelledAt).length,1);
    await pool.query("INSERT INTO app_settings(setting_key,setting_value) VALUES('seasonalHolidays',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify([{startDate:date,endDate:date}])]);
    assert.equal((await compensate(9,date,{role:'manager',id:1})).status,422);
    await pool.query("DELETE FROM app_settings WHERE setting_key='seasonalHolidays'");
    await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(7,'supervisors'),(8,'settings')");
    const staffPayload={name:'مشرف تجربة الصلاحيات',loginNumber:'987654321',password:'local-test-password',nationalId:'',phone:'',committeeIds:['1'],permissions:['settings']};
    const stronger=await request('/supervisors',staffPayload,{role:'manager',id:1});
    assert.equal(stronger.status,201);
    assert.equal((await request(`/supervisors/${stronger.body.id}`,{...staffPayload,password:'',permissions:[]},{method:'PUT'})).status,403);
    assert.equal((await request(`/supervisors/${stronger.body.id}`,null,{method:'DELETE'})).status,403);
    const delegated=await request('/supervisors',{...staffPayload,loginNumber:'987654322',permissions:['trackSession']});
    assert.equal(delegated.status,201);
    await pool.query("INSERT INTO auth_sessions(token_hash,user_role,user_id,user_name) VALUES('test-delete-session','supervisor',?,'Test')",[delegated.body.id]);
    assert.equal((await request(`/supervisors/${delegated.body.id}`,{...staffPayload,loginNumber:'987654322',password:'',permissions:['students']},{method:'PUT'})).status,200);
    const [stored]=await pool.query('SELECT permission_key AS permissionKey FROM supervisor_dashboard_permissions WHERE supervisor_id=?',[delegated.body.id]);
    assert.deepEqual(stored.map(row=>row.permissionKey),['students']);
    assert.equal((await request(`/supervisors/${delegated.body.id}`,null,{method:'DELETE'})).status,200);
    const [[revoked]]=await pool.query("SELECT COUNT(*) AS count FROM auth_sessions WHERE token_hash='test-delete-session'");
    assert.equal(Number(revoked.count),0);
    const c=await pool.getConnection();try{
      await c.beginTransaction();
      await assert.rejects(assertAdministratorScope(c,{role:'supervisor',id:7},{permissions:['settings'],managementPermission:'supervisors'}),{status:403});
      await assert.rejects(assertAdministratorScope(c,{role:'supervisor',id:7},{targetId:8,managementPermission:'supervisors'}),{status:403});
      await assertAdministratorScope(c,{role:'supervisor',id:7},{permissions:['students'],managementPermission:'supervisors'});
      await c.rollback();
    }finally{c.release();}
    await pool.query("DELETE FROM supervisor_dashboard_permissions WHERE supervisor_id=7 AND permission_key='trackSession'");
    const programOnlyWeek = await request('/grading/week');
    assert.equal(programOnlyWeek.status, 200);
    assert.ok(programOnlyWeek.body.students.flatMap(student => student.compensations).every(row => row.scope === 'program'));
    assert.equal((await request('/grading/track-compensation',{studentId:3,date,excuseReference:'مرجع'})).status,403);
    assert.deepEqual(getDashboardPermissionKeysForRequest({path:'/grading/weekly-component',method:'PUT',body:{component:'weekly'}}),['weeklySession']);
    assert.deepEqual(getDashboardPermissionKeysForRequest({path:'/grading/track-compensation',method:'POST'}),['trackSession']);
  });
  console.log('Isolated permissions/compensation MySQL passed: fixed and delegated grants, exact action authorization, assigned student scope, no escalation, concurrent duplicate prevention, full achievement grades, unchanged attendance for all four states, audit attribution, grade overwrite protection and holiday/date validation.');
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));await pool?.end();
  const c=await mysql.createConnection({host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT)||3306,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD});
  try{assert.match(database,/^nukhab_permissions_[a-f0-9]{16}$/);await c.query(`DROP DATABASE IF EXISTS \`${database}\``);}finally{await c.end();}
}
