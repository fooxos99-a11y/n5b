import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { initDatabase } from '../server/db.js';
import { saveTeacherReading, loadTeacherReading } from '../server/services/selfReading.js';
import { buildGradingOverview } from '../server/services/gradingReports.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';
import { getBusinessDate, shiftDateOnly } from '../shared/business-date.js';

assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_reading_hizbs_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
let pool;
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  const date = getBusinessDate();
  await pool.query("INSERT INTO committees (id,name) VALUES (1,'Reading test')");
  await pool.query("INSERT INTO supervisors (id,name,login_number,national_id,phone,job_title) VALUES (7,'Test','reading-test','','','')");
  await pool.query('INSERT INTO supervisor_committees (supervisor_id,committee_id) VALUES (7,1)');
  await pool.query("INSERT INTO students (id,name,login_number,national_id,guardian_phone,committee_id) VALUES (3,'Test','reading-test','','',1)");
  await pool.query(`INSERT INTO student_quran_plans (id,student_id,start_date,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
    next_memorization_page,next_review_page,status,reading_faces,reading_hizbs) VALUES (1,3,?,2,30,2,1,2,196,30,151,'completed',10,2)`, [shiftDateOnly(date, -7)]);
  await pool.query(`INSERT INTO student_quran_plan_prior_memorization
    (plan_id,student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah) VALUES (1,3,151,604,7,1,114,6)`);
  // Only the accepted, actual five-ayah execution belongs to the student's memorization.
  await pool.query(`INSERT INTO student_quran_tasks
    (id,plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,
      actual_to_surah,actual_to_ayah,teacher_completed)
    VALUES (1,1,3,?,'memorization',106,108,5,1,5,7,5,5,1),
      (2,1,3,?,'memorization',128,150,6,1,6,165,NULL,NULL,0)`, [date, date]);
  const payload = { supervisorId: 7, studentId: 3, date, completed: true, fromHizb: 59, toHizb: 59, actor: { role: 'supervisor', id: 7 } };
  const assigned = (await loadTeacherReading(pool, { supervisorId: 7, date })).students[0];
  assert.equal(assigned.expectedHizbs, 2);
  assert.equal(assigned.amount.hizbCount, 2);
  assert.equal(assigned.amount.faces, 22);
  assert.equal(assigned.amount.cursor, '7:160');
  assert.deepEqual(assigned.amount.ranges.map(row => [row.startSurah,row.startAyah,row.endSurah,row.endAyah]), [[5,1,5,5],[7,1,7,160]]);
  await saveTeacherReading(pool, payload);
  await saveTeacherReading(pool, payload);
  const [[complete]] = await pool.query("SELECT grade,max_grade AS max,detail_json AS detail FROM student_daily_grades WHERE component='reading'");
  assert.equal(Number(complete.grade), Number(complete.max));
  const detail = typeof complete.detail === 'string' ? JSON.parse(complete.detail) : complete.detail;
  assert.equal(detail.readingCursor, '7:160');
  assert.equal(detail.requiredFaces, 22);
  const [[ledger]] = await pool.query('SELECT COUNT(*) AS count,SUM(points) AS points FROM student_point_transactions');
  assert.equal(Number(ledger.count), 1);
  assert.equal(Number(ledger.points), Number(complete.grade));
  const reading = await saveTeacherReading(pool, { ...payload, toHizb: 60 });
  assert.equal(reading.expectedHizbs, 2); assert.equal(reading.hizbCount, 2);
  assert.equal((await loadTeacherReading(pool, { supervisorId: 7, date })).students[0].hizbCount, 2);
  assert.equal(await saveTeacherReading(pool, { ...payload, supervisorId: 8 }), null);
  assert.deepEqual((await loadTeacherReading(pool, { supervisorId: 8, date })).students, []);
  assert.equal((await saveTeacherReading(pool, { ...payload, fromHizb: 61, faces: 604 })).amount.cursor, '7:160');
  await assert.rejects(saveTeacherReading(pool, { ...payload, date: shiftDateOnly(date, 1) }), { status: 422 });
  const grades = await buildGradingOverview(createOverviewReportScope(pool, { auth: { role: 'supervisor', id: 7 }, committeeId: 1 }), { from: date, to: date });
  assert.equal(grades.reading.hizbs, 2); assert.equal(grades.reading.byStudent['3'].hizbs, 2);

  const legacy = { ...detail, requiredFaces: 12.75, readingCursor: '7:87',
    ranges: [detail.ranges[0], { ...detail.ranges[1], endAyah: 87, endPage: 161 }] };
  await pool.query("UPDATE student_daily_grades SET detail_json=? WHERE student_id=3 AND component='reading'", [JSON.stringify(legacy)]);
  const historical = (await loadTeacherReading(pool, { supervisorId: 7, date })).students[0];
  assert.equal(historical.amount.cursor, '7:87');
  assert.equal(historical.amount.faces, 12.75, 'Reading old grades must not rewrite saved reading or points');

  await saveTeacherReading(pool, { ...payload, completed: false });
  assert.equal(Number((await pool.query("SELECT grade FROM student_daily_grades WHERE component='reading'"))[0][0].grade), 0);
  const correctedMissed = (await loadTeacherReading(pool, { supervisorId: 7, date })).students[0];
  assert.equal(correctedMissed.status, 'missed');
  assert.equal(correctedMissed.amount.faces, 22);
  assert.equal(correctedMissed.amount.cursor, '7:160');
  await saveTeacherReading(pool, payload);
  const [[correctedGrade]] = await pool.query("SELECT grade,max_grade AS max,detail_json AS detail FROM student_daily_grades WHERE component='reading'");
  assert.equal(Number(correctedGrade.grade), Number(correctedGrade.max));
  const correctedDetail = typeof correctedGrade.detail === 'string' ? JSON.parse(correctedGrade.detail) : correctedGrade.detail;
  assert.equal(correctedDetail.requiredFaces, 22);
  assert.equal(correctedDetail.readingCursor, '7:160');
  await saveTeacherReading(pool, { ...payload, completed: null });
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM student_point_transactions'))[0][0].count), 0);

  await pool.query('DELETE FROM student_quran_plan_prior_memorization WHERE student_id=3');
  const partial = await saveTeacherReading(pool, payload);
  assert.equal(partial.hizbCount, 0.160256);
  assert.equal(partial.recordedFaces, 1.75);
  const [[partialGrade]] = await pool.query("SELECT grade,max_grade AS max FROM student_daily_grades WHERE component='reading'");
  assert.equal(Number(partialGrade.grade), Math.round(Number(partialGrade.max) * partial.hizbCount / 2 * 100) / 100);
  assert.ok(Number(partialGrade.grade) < Number(partialGrade.max) / 2);
  const partialReport = await buildGradingOverview(createOverviewReportScope(pool, { auth: { role: 'supervisor', id: 7 } }), { from: date, to: date });
  assert.equal(partialReport.reading.hizbs, partial.hizbCount);
  assert.equal(partialReport.reading.byStudent['3'].hizbs, partial.hizbCount);
  await saveTeacherReading(pool, { ...payload, completed: null });
  await pool.query('DELETE FROM student_quran_tasks WHERE student_id=3');
  await assert.rejects(saveTeacherReading(pool, payload), { status: 422 });
  globalThis.console.log('Isolated MySQL reading passed: screenshot regression, actual accepted memorization, fractional/full grades and reports, idempotent points, unauthorized/future/empty guards, missed/clear, and historical snapshots.');
} finally {
  await pool?.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_reading_hizbs_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
