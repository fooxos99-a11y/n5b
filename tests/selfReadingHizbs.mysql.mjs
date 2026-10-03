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
  await pool.query(`INSERT INTO student_quran_plans (id,student_id,start_page,end_page,start_surah,start_ayah,end_surah,end_ayah,
    next_memorization_page,next_review_page,status,reading_faces,reading_hizbs) VALUES (1,3,1,604,1,1,114,6,604,1,'completed',10,2)`);
  const payload = { supervisorId: 7, studentId: 3, date, completed: true, fromHizb: 59, toHizb: 59, actor: { role: 'supervisor', id: 7 } };
  await saveTeacherReading(pool, payload);
  await saveTeacherReading(pool, payload);
  const [[partial]] = await pool.query("SELECT grade,max_grade AS max,detail_json AS detail FROM student_daily_grades WHERE component='reading'");
  assert.equal(Number(partial.grade), Number(partial.max) / 2);
  const detail = typeof partial.detail === 'string' ? JSON.parse(partial.detail) : partial.detail;
  assert.deepEqual(detail.range, { startSurah: 78, startAyah: 1, endSurah: 86, endAyah: 17 });
  const [[ledger]] = await pool.query('SELECT COUNT(*) AS count,SUM(points) AS points FROM student_point_transactions');
  assert.equal(Number(ledger.count), 1);
  assert.equal(Number(ledger.points), Number(partial.grade));
  const reading = await saveTeacherReading(pool, { ...payload, toHizb: 60 });
  assert.equal(reading.expectedHizbs, 2); assert.equal(reading.hizbCount, 2);
  const [[complete]] = await pool.query("SELECT grade,max_grade AS max FROM student_daily_grades WHERE component='reading'");
  assert.equal(Number(complete.grade), Number(complete.max));
  assert.equal((await loadTeacherReading(pool, { supervisorId: 7, date })).students[0].hizbCount, 2);
  assert.equal(await saveTeacherReading(pool, { ...payload, supervisorId: 8 }), null);
  await assert.rejects(saveTeacherReading(pool, { ...payload, fromHizb: 61 }), { status: 422 });
  await assert.rejects(saveTeacherReading(pool, { ...payload, date: shiftDateOnly(date, 1) }), { status: 422 });
  const grades = await buildGradingOverview(createOverviewReportScope(pool, { auth: { role: 'supervisor', id: 7 }, committeeId: 1 }), { from: date, to: date });
  assert.equal(grades.reading.hizbs, 2); assert.equal(grades.reading.byStudent['3'].hizbs, 2);
  await saveTeacherReading(pool, { ...payload, completed: null });
  assert.equal(Number((await pool.query('SELECT COUNT(*) AS count FROM student_point_transactions'))[0][0].count), 0);
  globalThis.console.log('Isolated MySQL reading passed: exact Quran boundaries, proportional/full grade, idempotent points, scope/date/range guards, statistics and clearing.');
} finally {
  await pool?.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_reading_hizbs_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
