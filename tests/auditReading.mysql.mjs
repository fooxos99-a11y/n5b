import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { initDatabase, runWithDatabase } from '../server/db.js';
import { loadTeacherReading, saveTeacherReading } from '../server/services/selfReading.js';
import { ensureStudentPlanTasks, getActivePlanForStudent, loadSettings, removePriorMemorizationPageRange, getPriorMemorizationRangesForStudent, runRecitationTaskHandler, buildRecitationSessionsReport, buildOverviewReport, app } from '../server/index.js';
import { runRecitationSessionTransaction } from '../server/services/recitationSessionTransaction.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';
assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST || '127.0.0.1'));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const name = `nukhab_audit_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool;
try {
  pool = await initDatabase(name, { seedDefaultData: false });
  await runWithDatabase(name, {}, async () => {
    const date = getBusinessDate();
    await pool.query("INSERT INTO committees (id,name) VALUES (1,'Audit')");
    await pool.query("INSERT INTO supervisors (id,name,login_number,national_id,phone,job_title) VALUES (1,'Audit','audit-teacher','','','')");
    await pool.query('INSERT INTO supervisor_committees (supervisor_id,committee_id) VALUES (1,1)');
    await pool.query("INSERT INTO students (id,name,login_number,national_id,guardian_phone,committee_id) VALUES (1,'Audit','audit-student','','',1)");
    await pool.query("INSERT INTO student_quran_plans (id,student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,next_memorization_page,next_review_page,status,reading_faces) VALUES (1,1,1,604,1,1,114,6,604,1,'completed',10)");
    assert.equal((await loadTeacherReading(pool, { supervisorId: 1, date })).students[0].faces, 10);
    for (const [table, planColumn, planValue] of [['student_quran_prior_memorization', '', ''], ['student_quran_plan_prior_memorization', 'plan_id,', '1,']]) {
      await pool.query(`INSERT INTO ${table} (${planColumn}student_id,start_surah,start_ayah,start_page,end_surah,end_ayah,end_page,created_at)
        VALUES (${planValue}1,1,1,1,114,6,604,DATE_SUB(NOW(), INTERVAL 2 DAY))`);
    }
    const settings = await loadSettings();
    await ensureStudentPlanTasks(pool, await getActivePlanForStudent(pool, 1), date, settings);
    const [generated] = await pool.query('SELECT task_type AS type FROM student_quran_tasks');
    assert.ok(generated.some(row => row.type === 'review'), 'Completed plan continues review');
    assert.ok(!generated.some(row => row.type === 'memorization'), 'Completed memorization is not regenerated');
    await removePriorMemorizationPageRange(pool, 1, 1, 1);
    const remaining = await getPriorMemorizationRangesForStudent(pool, 1);
    assert.ok(remaining.length);
    assert.ok(remaining.every(range => Number(range.startPage) > 1), 'Deleted prior page must not reappear from standalone storage');
    for (const table of ['student_quran_prior_memorization', 'student_quran_plan_prior_memorization']) {
      const [[old]] = await pool.query(`SELECT COUNT(*) AS count FROM ${table} WHERE start_page = 1`);
      assert.equal(Number(old.count), 0);
    }

    const payload = { supervisorId: 1, studentId: 1, date, completed: true, faces: 7.5, actor: { role: 'supervisor', id: 1 } };
    await saveTeacherReading(pool, payload);
    await saveTeacherReading(pool, payload);
    const [[grade]] = await pool.query("SELECT grade,max_grade AS max FROM student_daily_grades WHERE component='reading'");
    assert.equal(Number(grade.grade), Number(grade.max) * 0.75);
    const [[ledger]] = await pool.query('SELECT COUNT(*) AS count,SUM(points) AS points FROM student_point_transactions');
    assert.equal(Number(ledger.count), 1);
    assert.equal(Number(ledger.points), Number(grade.grade));
    await assert.rejects(saveTeacherReading(pool, { ...payload, date: '2025-01-01' }), { status: 422 });
    assert.equal(await saveTeacherReading(pool, { ...payload, supervisorId: 999 }), null);
    await pool.query("INSERT INTO student_quran_plans (id,student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,next_memorization_page,next_review_page,status,reading_faces) VALUES (2,1,1,604,1,1,114,6,1,1,'paused',20)");
    const current = (await loadTeacherReading(pool, { supervisorId: 1, date })).students[0];
    assert.notEqual(current.faces, 20);
    await saveTeacherReading(pool, { ...payload, completed: null });
    assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM student_point_transactions'))[0][0].count), 0);
    await pool.query("INSERT INTO app_settings (setting_key,setting_value) VALUES ('teacherMemorizationRecitationMode','count') ON DUPLICATE KEY UPDATE setting_value='count'");
    await pool.query("INSERT INTO students (id,name,login_number,national_id,guardian_phone,committee_id) VALUES (2,'Correction','audit-correction','','',1)");
    await pool.query("INSERT INTO student_quran_plans (id,student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,next_memorization_page,next_review_page,status,reading_faces) VALUES (3,2,1,1,1,1,1,7,1,1,'active',10)");
    await pool.query("INSERT INTO attendance_records (student_id,record_date,status) VALUES (2,?,'present')", [date]);
    await ensureStudentPlanTasks(pool, await getActivePlanForStudent(pool, 2), date, await loadSettings());
    const [[task]] = await pool.query("SELECT id FROM student_quran_tasks WHERE student_id=2 AND task_type='memorization' LIMIT 1");
    assert.ok(task);
    const source = { auth: { id: 1, role: 'supervisor', name: 'Audit' } };
    const submit = async (sessionId, correctionOf, notMemorized, committedAtLocal = null) => runRecitationSessionTransaction(pool, async (connection, transaction) => {
      const result = await runRecitationTaskHandler(source, { id: '1', taskId: String(task.id) }, {
        sessionId, committedAtLocal, requestId: `${sessionId}:${task.id}`, date, evaluationMode: 'count', warningCount: 0, mistakeCount: 0,
        ...(correctionOf ? { correctionOf } : {}), ...(notMemorized ? { notMemorized: true } : {}),
      }, [task.id], connection, transaction);
      transaction.failed = result.statusCode !== 200;
      return result;
    });
    const first = randomUUID(), correction = randomUUID();
    const failed = await submit(first, null, true);
    assert.equal(failed.value.statusCode, 200, JSON.stringify(failed.value));
    const corrected = await submit(correction, first, false);
    assert.equal(corrected.value.statusCode, 200, JSON.stringify(corrected.value));
    assert.equal(corrected.rolledBack, false);
    const [attempts] = await pool.query('SELECT teacher_completed AS passed,is_official AS official FROM student_quran_recitation_attempts WHERE task_id=? ORDER BY id', [task.id]);
    assert.deepEqual(attempts.map(row => [Number(row.passed), Number(row.official)]), [[0,0],[1,1]]);
    const report = await buildRecitationSessionsReport({ from: date, to: date, studentId: 2, studentHistory: true, auth: source.auth });
    assert.equal(report.rows[0].evaluatorId, 1);
    assert.equal(report.rows[0].sessionId, correction);
    const staleOffline = await submit(randomUUID(), null, true, '2026-01-01T00:00:00Z');
    assert.equal(staleOffline.value.statusCode, 409, 'Old offline submissions cannot undo an explicit correction');
    const reverted = await submit(randomUUID(), correction, true);
    assert.equal(reverted.value.statusCode, 200, JSON.stringify(reverted.value));
    const [[rewound]] = await pool.query('SELECT next_memorization_page AS page,status FROM student_quran_plans WHERE id=3');
    assert.equal(Number(rewound.page), 1);
    assert.equal(rewound.status, 'active');
    const overview = await buildOverviewReport({ from: date, to: shiftDateOnly(date, 6), queryExecutor: pool, auth: { role: 'manager', id: 1 } });
    assert.equal(overview.attendance.students.total, 2, 'Future days are excluded from attendance');
    assert.equal(overview.attendance.supervisors.total, 1);
    assert.equal(overview.attendance.students.present, 1);
    await pool.query("INSERT INTO narration_events (id,name,start_date,end_date,created_by_role,created_by_name) VALUES (1,'Audit',?,?,'manager','Audit')", [date,date]);
    await pool.query("INSERT INTO narration_event_students (id,event_id,student_id,student_name,committee_id,status,final_score) VALUES (1,1,2,'Audit',1,'completed',90)");
    await pool.query("INSERT INTO narration_event_parts (event_student_id,juz_number,start_surah,start_ayah,start_page,end_surah,end_ayah,end_page,score,warning_count,mistake_count) VALUES (1,1,1,1,1,2,141,21,90,1,2)");
    const statusRoute = app.router.stack.find(layer => layer.route?.path === '/api/narration-events/:eventId/students/:studentEntryId/status').route.stack.at(-1).handle;
    let statusResult, statusError;
    const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { statusResult = value; } };
    await statusRoute({ params: { eventId: '1', studentEntryId: '1' }, body: { status: 'absent' }, auth: { role: 'manager', id: 1 } }, response, error => { statusError = error; });
    assert.ifError(statusError);
    assert.deepEqual(statusResult, { ok: true });
    const [[cleared]] = await pool.query('SELECT score,warning_count AS warnings,mistake_count AS mistakes FROM narration_event_parts WHERE event_student_id=1');
    assert.deepEqual(cleared, { score: null, warnings: 0, mistakes: 0 });
    globalThis.console.log('Isolated narration absence clears saved part evaluations.');
    globalThis.console.log('Isolated statistics SQL passed with future dates excluded.');
    globalThis.console.log('Isolated correction passed: failed to passed to failed, official attempt replacement, report identity, plan rewind.');
    globalThis.console.log('Isolated MySQL completed-plan revision, prior deletion and reading passed: completed plan, proportional grade, idempotent points, date/scope guards, clearing.');
  });
} finally {
  await pool?.end();
  const admin = await mysql.createConnection({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '' });
  try { assert.match(name, /^nukhab_audit_[a-f0-9]{16}$/); await admin.query(`DROP DATABASE IF EXISTS \`${name}\``); }
  finally { await admin.end(); }
}
