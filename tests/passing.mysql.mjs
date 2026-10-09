import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mysql from 'mysql2/promise';
import { register } from 'node:module';
import { URL } from 'node:url';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { createPassingRouter } from '../server/routes/passingRoutes.js';
import { createStudentPlanPauseRouter } from '../server/routes/studentPlanPauseRoutes.js';
import { requirePermission } from '../server/services/dashboardPermissions.js';
import { readQuranRange } from '../server/services/quranReferenceCache.js';
import { parsePassingPolicy } from '../shared/passing-policy.js';
import { loadPassingExam } from '../server/services/passing.js';
import { refreshPassingRehifz } from '../server/services/passingRehifz.js';
import { forecastQuranPlan } from '../server/services/quranPlanForecast.js';
import { saveStudentPlanPause, loadStudentPlanPause } from '../server/services/studentPlanPause.js';
import { assertStudyDate, studyDateSql, studyWeekSql } from '../server/services/seasonalHolidays.js';
import { expireQuranTasks } from '../server/services/expireQuranTasks.js';
import { planScheduleDates } from '../server/services/planScheduleDates.js';
import { saveGradingPolicy } from '../server/services/grading.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

register(new URL('./fixtures/isolated-server-loader.mjs', import.meta.url), import.meta.url);
const { getStudentMemorizedRanges, buildQuranRangeMushafData, normalizeQuranRangeWordMarks, ensureStudentPlanTasks, previewStudentPlanDay, getActivePlanForStudent, loadSettings, rateSupervisorQuranTaskHandler, app: portalApp } = await import('../server/index.js');

assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_passing_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool, server;
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const date = getBusinessDate(), start = shiftDateOnly(date, -10), pauseStart = shiftDateOnly(date, -3);
  const actor = { role: 'manager', id: 1, name: 'Test' };
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'Own'),(2,'Other')");
  for (const [id, role] of [[7, 'supervisor'], [8, 'admin'], [9, 'admin'], [10, 'reciter'], [11, 'admin']]) {
    await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(?,'Test',?,'','','',?)", [id, `passing-${id}`, role]);
  }
  await pool.query("INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES(7,'quranPassing'),(8,'quranPassing'),(8,'studentPlans'),(11,'quranPassing')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1)');
  for (const [id, committee] of [[3, 1], [4, 2]]) {
    await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id) VALUES(?,'Test',?,'','',?)", [id, `passing-${id}`, committee]);
    await pool.query(`INSERT INTO student_quran_plans(id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
      next_memorization_page,next_review_page,status) VALUES(?,?,?,1,604,1,1,114,6,1,1,'active')`, [id, id, start]);
  }
  // Use the production memorized-range loader, including approved tasks and prior memorization.
  const columns = (await pool.query('SHOW COLUMNS FROM student_quran_prior_memorization'))[0].map(row => row.Field);
  assert.ok(columns.includes('student_id'));
  await pool.query(`INSERT INTO student_quran_prior_memorization(student_id,start_page,start_surah,start_ayah,end_page,end_surah,end_ayah)
    VALUES(3,1,1,1,41,2,252),(3,42,2,253,42,2,254)`);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.get('x-test-role');
    req.auth = role ? { role, id: Number(req.get('x-test-id') || 1), name: 'Test' } : null;
    runWithDatabase(database, {}, next);
  });
  app.use('/passing', createPassingRouter({ db: () => pool, loadMemorizedRanges: getStudentMemorizedRanges,
    loadAyahs: connection => readQuranRange(connection, 1, 604), buildMushafData: buildQuranRangeMushafData, normalizeMarks: normalizeQuranRangeWordMarks }));
  app.use('/pause', createStudentPlanPauseRouter({ db: () => pool, requireRead: requirePermission('studentPlans') }));
  app.use((error, _req, res, next) => res.headersSent ? next(error) : res.status(error.status || error.statusCode || 500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  const call = async (path, body, role = 'manager', id = 1, method = body === undefined ? 'GET' : 'POST') => {
    const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role, 'x-test-id': String(id) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const ok = response => { assert.ok(response.status < 300, JSON.stringify(response)); return response.body; };
  for (const [role, id] of [[null, 1], ['student', 3], ['admin', 9], ['reciter', 10]]) assert.equal((await call('/passing?type=branch', undefined, role, id)).status, 403);
  assert.equal(ok(await call('/passing/students', undefined, 'supervisor', 7)).length, 1);
  assert.equal(ok(await call('/passing/students', undefined, 'admin', 8)).length, 2);
  assert.equal((await call('/passing', { studentId: 4, type: 'branch', juz: 1 }, 'supervisor', 7)).status, 403);
  assert.equal((await call('/passing', { studentId: 4, type: 'hafiz' })).status, 422);
  for (const juz of [0, 31, '1', 1.5]) assert.equal((await call('/passing', { studentId: 3, type: 'branch', juz })).status, 422);
  assert.equal((await call('/passing/policy', { policy: {} }, 'manager', 1, 'PUT')).status, 422);
  const policy = parsePassingPolicy({});
  policy.hafiz.mistakeDeduction = 10;
  policy.branch.juzOverrides[1] = { ...policy.branch, juzOverrides: undefined, maxWarnings: 1 };
  assert.equal((await call('/passing/policy', { policy }, 'admin', 8, 'PUT')).status, 403);
  ok(await call('/passing/policy', { policy }, 'manager', 1, 'PUT'));
  const branch = ok(await call('/passing', { studentId: 3, type: 'branch', juz: 1 }, 'supervisor', 7));
  assert.equal(branch.parts.length, 1);
  assert.equal(branch.parts[0].ranges[0].startSurah, 1);
  assert.equal(branch.parts[0].ranges.at(-1).endAyah, 141);
  assert.equal((await call('/passing', { studentId: 3, type: 'branch', juz: 1 })).status, 409);
  const hafiz = ok(await call('/passing', { studentId: 3, type: 'hafiz' }));
  assert.deepEqual(hafiz.parts.map(part => part.juzNumber), [1, 2]);
  assert.equal(hafiz.parts.length, 2, 'exclude the partial third juz');
  assert.equal(hafiz.parts[1].ranges.length, 1);
  await pool.query(`INSERT INTO student_quran_prior_memorization(student_id,start_page,start_surah,start_ayah,end_page,end_surah,end_ayah) VALUES(3,26,2,177,26,2,177)`);
  assert.equal((await loadPassingExam(pool, hafiz.id)).parts.length, 2, 'scope frozen at creation');
  const partId = branch.parts[0].id;
  const attempt = (extra = {}) => ({ mode: 'count', requestId: randomUUID(), previousAttemptId: 0, mistakeCount: 0, warningCount: 0, hesitationCount: 0, ...extra });
  assert.equal((await call(`/passing/parts/${partId}/attempts`, attempt(), 'student', 3)).status, 403);
  const foreign = ok(await call('/passing', { studentId: 4, type: 'branch', juz: 2 }));
  assert.equal((await call(`/passing/parts/${foreign.parts[0].id}/attempts`, attempt(), 'supervisor', 7)).status, 403);
  assert.equal((await call(`/passing/parts/${foreign.parts[0].id}/segments/0/mushaf`, undefined, 'supervisor', 7)).status, 403);
  for (const mistakeCount of [-1, 1.5, '1', 1001]) assert.equal((await call(`/passing/parts/${partId}/attempts`, attempt({ mistakeCount }))).status, 422);
  const failAttempt = attempt({ warningCount: 2 });
  const both = await Promise.all([call(`/passing/parts/${partId}/attempts`, failAttempt), call(`/passing/parts/${partId}/attempts`, failAttempt)]);
  assert.deepEqual(ok(both[0]), ok(both[1]));
  assert.equal(both[0].body.result.passed, false, 'count limit can fail despite passing score');
  let latest = await loadPassingExam(pool, branch.id);
  assert.equal(latest.parts[0].attempts.length, 1);
  assert.equal((await call(`/passing/parts/${partId}/attempts`, attempt())).status, 409, 'stale attempt guard');
  policy.branch.mistakeDeduction = 2;
  policy.branch.juzOverrides = {};
  ok(await call('/passing/policy', { policy }, 'manager', 1, 'PUT'));
  const previousAttemptId = latest.parts[0].latestAttempt.id;
  assert.equal((await call(`/passing/parts/${partId}/attempts`, attempt({ previousAttemptId }))).status, 409, 'must decide before another attempt');
  ok(await call(`/passing/parts/${partId}/rehifz`, { attemptId: previousAttemptId, repeat: false }));
  assert.equal(ok(await call(`/passing/parts/${partId}/attempts`, attempt({ previousAttemptId, mistakeCount: 3 }))).result.score, 94);
  latest = await loadPassingExam(pool, branch.id);
  assert.equal(latest.status, 'passed');
  assert.deepEqual(latest.parts[0].attempts.map(row => row.policy.mistakeDeduction), [2, 5]);
  assert.equal((await call(`/passing/parts/${partId}/attempts`, attempt({ previousAttemptId: latest.parts[0].latestAttempt.id }))).status, 409);
  // Real Mushaf payload and production word normalization: injected counts/text must not win.
  const mushafPart = hafiz.parts[0];
  const mushaf = ok(await call(`/passing/parts/${mushafPart.id}/segments/1/mushaf`));
  assert.ok(mushaf.pages.length > 0);
  const word = mushaf.pages.flatMap(page => page.words).find(item => item.location?.startsWith('2:140:'));
  assert.ok(word, 'real Quran words returned');
  const mark = { markType: 'mistake', startLocation: word.location, endLocation: word.location, selectedText: 'forged', notes: 'Test' };
  const mushafBody = attempt({ mode: 'mushaf', segments: [{ index: 0, wordMarks: [] }, { index: 1, wordMarks: [mark] }], mistakeCount: 999 });
  assert.equal((await call(`/passing/parts/${mushafPart.id}/attempts`, { ...mushafBody, segments: [{ index: 0, wordMarks: [] }, { index: 1, wordMarks: [{ ...mark, startLocation: '2:150:1', endLocation: '2:150:1' }] }] })).status, 422);
  assert.equal(ok(await call(`/passing/parts/${mushafPart.id}/attempts`, mushafBody)).result.mistakeCount, 1);
  latest = await loadPassingExam(pool, hafiz.id);
  assert.equal(latest.status, 'in_progress');
  assert.notEqual(latest.parts[0].latestAttempt.marks[0].selectedText, 'forged');
  const otherPart = hafiz.parts[1];
  assert.equal((await call(`/passing/parts/${otherPart.id}/attempts`, attempt({ mode: 'mushaf', segments: [] }))).status, 422);
  for (const segments of [[null, { index: 1, wordMarks: [] }], [{ index: 0, wordMarks: [] }, { index: 0, wordMarks: [] }], [{ index: '0', wordMarks: [] }, { index: 1, wordMarks: [] }]]) {
    assert.equal((await call(`/passing/parts/${otherPart.id}/attempts`, attempt({ mode: 'mushaf', segments }))).status, 422);
  }
  // Both plans have pending pre-pause work; only the stopped student's work is frozen.
  await saveGradingPolicy(pool, { generalMargin: 0, weeklyProgram: { workDays: [0, 1, 2, 3, 4, 5, 6] } });
  await runWithDatabase(database, {}, async () => {
    for (const id of [3, 4]) await ensureStudentPlanTasks(pool, await getActivePlanForStudent(pool, id), start, await loadSettings());
  });
  await saveStudentPlanPause(pool, { studentId: 3, paused: true, revision: 0, date: pauseStart, actor });
  assert.equal((await call('/pause/4', { paused: true, revision: 0 }, 'supervisor', 7, 'PUT')).status, 403);
  assert.equal((await call('/pause/3', { paused: 'true', revision: 1 }, 'manager', 1, 'PUT')).status, 422);
  assert.equal(ok(await call('/pause/3', { paused: true, revision: 0 }, 'supervisor', 7, 'PUT')).revision, 1, 'idempotent pause');
  assert.equal((await call('/pause/3', { paused: false, revision: 0 }, 'manager', 1, 'PUT')).status, 409);
  await assert.rejects(assertStudyDate(pool, date, 3), { status: 422 });
  await assertStudyDate(pool, date, 4);
  await runWithDatabase(database, {}, async () => {
    await ensureStudentPlanTasks(pool, await getActivePlanForStudent(pool, 3), date, await loadSettings());
  });
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM student_quran_tasks WHERE student_id=3 AND task_date>=?', [pauseStart]))[0][0].count), 0);
  await expireQuranTasks(pool, date);
  assert.deepEqual((await pool.query("SELECT student_id AS studentId,student_status AS status FROM student_quran_tasks WHERE task_type='memorization' ORDER BY student_id"))[0].map(row => [Number(row.studentId), row.status]), [[3, 'pending'], [4, 'not_done']]);
  const [study] = await pool.query(`SELECT s.id, ${studyDateSql('d.date', 's.id')} AS study, ${studyWeekSql('d.date', 's.id')} AS weekStudy FROM students s CROSS JOIN (SELECT ? AS date) d ORDER BY s.id`, [date]);
  assert.deepEqual(study.map(row => Number(row.study)), [0, 1]);
  assert.deepEqual(study.map(row => Number(row.weekStudy)), [0, 1]);
  const before = await planScheduleDates(pool, start, date, [0, 1, 2, 3, 4, 5, 6], 'workDays', 3);
  assert.ok(before.every(day => day < pauseStart));
  ok(await call('/pause', { paused: true, revision: 0 }, 'manager', 1, 'PUT'));
  ok(await call('/pause', { paused: false, revision: 1 }, 'manager', 1, 'PUT'));
  assert.equal((await loadStudentPlanPause(pool, 3)).periods.at(-1).endDate, null);
  assert.equal(ok(await call(`/passing/parts/${otherPart.id}/attempts`, attempt())).result.passed, true, 'passing remains allowed during pause');
  assert.equal((await loadPassingExam(pool, hafiz.id)).status, 'passed');
  const latestOther = (await loadPassingExam(pool, hafiz.id)).parts[1].latestAttempt;
  const decisionPath = `/passing/parts/${otherPart.id}/rehifz`;
  for (const [role, id] of [[null, 1], ['student', 3], ['admin', 9], ['reciter', 10]]) {
    assert.equal((await call(decisionPath, { attemptId: latestOther.id, repeat: false }, role, id)).status, 403);
  }
  assert.equal((await call(decisionPath, { attemptId: latestOther.id, repeat: true }, 'admin', 11)).status, 403, 'passing permission does not grant plan mutation');
  for (const body of [{ attemptId: latestOther.id, repeat: 'true' }, { attemptId: '1', repeat: false }]) assert.equal((await call(decisionPath, body)).status, 422);
  assert.equal((await call(`/passing/parts/${foreign.parts[0].id}/rehifz`, { attemptId: latestOther.id, repeat: false }, 'supervisor', 7)).status, 403);
  assert.equal((await call(decisionPath, { attemptId: latestOther.id + 1000, repeat: false })).status, 404);
  const [[planBefore]] = await pool.query('SELECT * FROM student_quran_plans WHERE id=3');
  const firstDecision = { attemptId: latestOther.id, repeat: false };
  const keep = ok(await call(decisionPath, firstDecision, 'admin', 11));
  assert.deepEqual(ok(await call(decisionPath, firstDecision)), keep, 'idempotent keep');
  assert.equal((await call(decisionPath, { ...firstDecision, repeat: true })).status, 409);
  assert.deepEqual((await pool.query('SELECT * FROM student_quran_plans WHERE id=3'))[0][0], planBefore, 'keep leaves plan unchanged');
  const savedBranch = (await loadPassingExam(pool, branch.id)).parts[0].latestAttempt;
  const repeatBody = { attemptId: savedBranch.id, repeat: true };
  const repeatPath = `/passing/parts/${partId}/rehifz`;
  const duplicateDecisions = await Promise.all([call(repeatPath, repeatBody, 'admin', 8), call(repeatPath, repeatBody, 'admin', 8)]);
  assert.deepEqual(ok(duplicateDecisions[0]), ok(duplicateDecisions[1]));
  const revisionId = duplicateDecisions[0].body.rehifzId;
  assert.ok(revisionId);
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM student_passing_rehifz'))[0][0].count), 1);
  await refreshPassingRehifz(pool, revisionId, date);
  assert.equal((await pool.query('SELECT status FROM student_passing_rehifz WHERE id=?', [revisionId]))[0][0].status, 'pending', 'historic approvals do not complete re-hifz');
  await runWithDatabase(database, {}, async () => { await ensureStudentPlanTasks(pool, await getActivePlanForStudent(pool, 3), date, await loadSettings()); });
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM student_quran_tasks WHERE passing_rehifz_id=?', [revisionId]))[0][0].count), 0, 'stopped plan retains queue without generation');
  ok(await call('/pause/3', { paused: false, revision: 1 }, 'manager', 1, 'PUT'));
  await assertStudyDate(pool, date, 3);
  await assert.rejects(assertStudyDate(pool, pauseStart, 3), { status: 422 });
  await runWithDatabase(database, {}, async () => {
    const generate = async day => ensureStudentPlanTasks(pool, await getActivePlanForStudent(pool, 3), day, await loadSettings());
    await Promise.all([generate(date), generate(date)]);
    const [todayTasks] = await pool.query("SELECT id,from_surah AS fromSurah,from_ayah AS fromAyah,target_pages AS faces FROM student_quran_tasks WHERE task_date=? AND passing_rehifz_id=? AND task_type='memorization'", [date, revisionId]);
    assert.ok(todayTasks.length);
    assert.ok(todayTasks.reduce((sum, task) => sum + Number(task.faces), 0) <= 1, 'daily amount is respected');
    assert.equal(todayTasks[0].fromSurah, 1);
    assert.equal((await planScheduleDates(pool,date,date,[0,1,2,3,4,5,6],'workDays',3,true)).length,0,'re-hifz is not owed normal memorization');
    assert.equal((await planScheduleDates(pool,date,date,[0,1,2,3,4,5,6],'workDays',3)).length,1,'re-hifz remains an active study day');
    const plan=await getActivePlanForStudent(pool,3),acceptedRanges=await getStudentMemorizedRanges(pool,3,{approvedOnly:true});
    const withRehifz=await forecastQuranPlan(pool,{plan,acceptedRanges,today:date,workDays:[0,1,2,3,4,5,6]});
    await pool.query("UPDATE student_passing_rehifz SET status='completed' WHERE id=?",[revisionId]);
    const withoutRehifz=await forecastQuranPlan(pool,{plan,acceptedRanges,today:date,workDays:[0,1,2,3,4,5,6]});
    await pool.query("UPDATE student_passing_rehifz SET status='pending' WHERE id=?",[revisionId]);
    assert.equal(withRehifz.delayedFaces,withoutRehifz.delayedFaces);
    assert.ok(withRehifz.projectedEndDate>withoutRehifz.projectedEndDate,'forecast includes the pending whole-juz work');
    const response = () => ({ statusCode: 200, status(value) { this.statusCode=value; return this; }, set() { return this; }, json(value) { this.body=value; return this; } });
    const todayRoute=portalApp.router.stack.find(item=>item.route?.path==='/api/students/:id/quran-today').route.stack.at(-1).handle;
    const todayResponse=response();let todayError;
    await todayRoute({auth:{role:'supervisor',id:7},params:{id:'3'}},todayResponse,cause=>{todayError=cause;});
    if(todayError)throw todayError;
    assert.equal(todayResponse.statusCode,200);
    assert.ok(todayResponse.body.todayAmounts.some(task=>task.passingRehifzId===revisionId));
    assert.equal(todayResponse.body.todayAmounts.find(task=>task.passingRehifzId===revisionId).trackLabel,'إعادة حفظ');
    assert.equal(todayResponse.body.executionLimits.memorization,null,'cannot select a normal-plan extension from re-hifz');
    const taskCountBefore=Number((await pool.query('SELECT COUNT(*) AS count FROM student_quran_tasks'))[0][0].count);
    const tomorrowAmount=(await previewStudentPlanDay(pool,plan,shiftDateOnly(date,1),await loadSettings())).find(task=>task.taskType==='memorization');
    assert.equal(tomorrowAmount?.passingRehifzId,revisionId,'read-only preview follows the pending juz');
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM student_quran_tasks'))[0][0].count),taskCountBefore,'preview writes no tasks');
    await pool.query("INSERT INTO attendance_records(student_id,record_date,status) VALUES(3,?,'present')", [date]);
    await pool.query("INSERT INTO staff_recitation_preferences(staff_id,memorization_mode,mastery_mode,review_mode,link_mode) VALUES(7,'count','count','count','count')");
    const sessionId=randomUUID();
    const rate = async notMemorized => {
      const res=response(); let error;
      await rateSupervisorQuranTaskHandler({ auth: { role:'supervisor',id:7 }, params:{ id:'7',taskId:String(todayTasks[0].id) }, body:{ date,sessionId,notMemorized,mistakeCount:0,warningCount:0,hesitationCount:0,requestId:randomUUID() } }, res, cause => { error=cause; });
      if (error) throw error;
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    };
    await rate(true);
    assert.equal((await pool.query('SELECT next_memorization_page FROM student_quran_plans WHERE id=3'))[0][0].next_memorization_page, planBefore.next_memorization_page, 'failure never rewinds original cursor');
    await rate(false);
    assert.equal((await pool.query('SELECT next_memorization_page FROM student_quran_plans WHERE id=3'))[0][0].next_memorization_page, planBefore.next_memorization_page, 'success never advances original cursor');
    const editRange = portalApp.router.stack.find(item => item.route?.path === '/api/supervisors/:id/quran-evaluation/:taskId/range').route.stack.at(-1).handle;
    const editResponse=response(); let rangeError;
    await editRange({ auth:{ role:'supervisor',id:7 },params:{ id:'7',taskId:String(todayTasks[0].id) },body:{ date } },editResponse,cause=>{rangeError=cause;});
    if(rangeError)throw rangeError;
    assert.equal(editResponse.statusCode,422,'cannot extend re-hifz into another juz');
    for(let offset=1;offset<=28;offset++) {
      const day=shiftDateOnly(date,offset);
      await generate(day);
      await pool.query("UPDATE student_quran_tasks SET teacher_completed=1,student_status='done' WHERE task_date=? AND passing_rehifz_id=? AND task_type='memorization'",[day,revisionId]);
      await refreshPassingRehifz(pool,revisionId,day);
      if((await pool.query('SELECT status FROM student_passing_rehifz WHERE id=?',[revisionId]))[0][0].status==='completed') break;
    }
    assert.equal((await pool.query('SELECT status FROM student_passing_rehifz WHERE id=?',[revisionId]))[0][0].status,'completed','all verses in whole juz must receive fresh approvals');
    const [ranges]=await pool.query("SELECT from_surah AS startSurah,from_ayah AS startAyah,to_surah AS endSurah,to_ayah AS endAyah FROM student_quran_tasks WHERE passing_rehifz_id=? AND task_type='memorization'",[revisionId]);
    assert.ok(ranges.every(range=>range.startSurah>=1 && range.endSurah<=2 && (range.endSurah!==2 || range.endAyah<=141)),'never leaves whole juz');
    assert.equal((await pool.query('SELECT next_memorization_page FROM student_quran_plans WHERE id=3'))[0][0].next_memorization_page,planBefore.next_memorization_page);
    await generate(shiftDateOnly(date,30));
    assert.ok((await pool.query("SELECT id FROM student_quran_tasks WHERE student_id=3 AND task_date=? AND task_type='memorization' AND passing_rehifz_id IS NULL",[shiftDateOnly(date,30)]))[0].length,'normal memorization resumes');
  });
  // Old partial records cannot receive a new result or a whole-juz request.
  const partialExam = ok(await call('/passing', { studentId:4,type:'branch',juz:3 }));
  const partialPart=partialExam.parts[0];
  await pool.query('UPDATE student_passing_parts SET ranges_json=? WHERE id=?',[JSON.stringify([{startPage:42,startSurah:2,startAyah:253,endPage:42,endSurah:2,endAyah:254}]),partialPart.id]);
  assert.equal((await call(`/passing/parts/${partialPart.id}/attempts`,attempt())).status,422);
  assert.equal((await loadPassingExam(pool,branch.id)).parts[0].latestAttempt.rehifzStatus,'completed');
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id) VALUES(5,'No plan','passing-5','','',1)");
  const noPlan=ok(await call('/passing',{studentId:5,type:'branch',juz:1}));
  const noPlanPart=noPlan.parts[0].id;
  const noPlanAttempt=ok(await call(`/passing/parts/${noPlanPart}/attempts`,attempt())).result.attemptId;
  assert.equal((await call(`/passing/parts/${noPlanPart}/rehifz`,{attemptId:noPlanAttempt,repeat:true})).status,422);
  ok(await call(`/passing/parts/${noPlanPart}/rehifz`,{attemptId:noPlanAttempt,repeat:false}));
  globalThis.console.log('Passing MySQL/HTTP: roles/scope, full-juz enforcement, policies/history, real Mushaf marks, idempotent decisions, whole-juz re-hifz/daily amounts, fresh approvals/cursor preservation, forecasts/previews, pauses and resumption passed.');
} finally {
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await pool?.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_passing_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
