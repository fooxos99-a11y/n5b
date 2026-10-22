import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { register } from 'node:module';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
import mysql from 'mysql2/promise';
import express from 'express';

assert.equal(process.env.MYSQL_HOST, '127.0.0.1');
assert.equal(process.env.MYSQL_PORT, '3310');
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const database = `nukhab_auto_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
process.env.MYSQL_DATABASE = database;
// Reuse the guarded local loader to suppress production boot, schedulers and .env loading.
register(new URL('../scripts/call-archive-local-loader.mjs', import.meta.url), { data: { localCallArchive: true } });
const { initDatabase, runWithDatabase, db } = await import('../server/db.js');
const { localCallArchiveApp: productionApp } = await import('../server/index.js');
const { createAutomaticPlanRouter } = await import('../server/routes/automaticPlanRoutes.js');
const { activateQueuedQuranPlan } = await import('../server/services/quranPlanQueue.js');
const { getBusinessDate, shiftDateOnly } = await import('../shared/business-date.js');
let pool, server;
const verseRange = (surah, from, to) => ({ startSurah: surah, startAyah: from, endSurah: surah, endAyah: to });
try {
  pool = await initDatabase(database, { seedDefaultData: false });
  await pool.query("INSERT INTO committees(id,name) VALUES(1,'Auto test'),(2,'Outside scope')");
  await pool.query("INSERT INTO supervisors(id,name,login_number,national_id,phone,job_title,role) VALUES(7,'Auto supervisor','auto-test-7','','','','supervisor')");
  await pool.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES(7,1)');
  await pool.query("INSERT INTO students(id,name,login_number,national_id,guardian_phone,committee_id) VALUES(3,'Auto student','auto-3','','',1),(4,'Foreign student','auto-4','','',2),(5,'Prior only','auto-5','','',1)");
  const route = productionApp.router.stack.find(item => item.route?.path === '/api/student-plans/:studentId' && item.route.methods.put).route;
  const requireRead = route.stack[0].handle;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    runWithDatabase(database, {}, () => new Promise(resolve => {
      res.once('finish', resolve);
      req.auth = { role: req.headers['x-test-role'] || 'manager', id: Number(req.headers['x-test-id'] || 1) };
      next();
    })).catch(next);
  });
  app.use('/automatic', createAutomaticPlanRouter({ db, requireRead }));
  app.put('/student-plans/:studentId', ...route.stack.map(item => item.handle));
  app.use((error, _req, res, next) => {
    void next;
    res.status(error.statusCode || error.status || 500).json({ message: error.message });
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const call = async (path, body, { role = 'manager', id = 1, method = body ? 'POST' : 'GET' } = {}) => {
    const res = await globalThis.fetch(`http://127.0.0.1:${server.address().port}${path}`, { method,
      headers: { 'Content-Type': 'application/json', 'x-test-role': role, 'x-test-id': String(id) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json() };
  };
  const initial = await call('/automatic');
  assert.equal(initial.status, 200); assert.equal(new Set(initial.body.template.ranges.map(item => item.label)).size, 15);
  assert.equal((await call('/automatic', null, { role: 'student', id: 3 })).status, 403);
  assert.equal((await call('/automatic', initial.body.template, { role: 'supervisor', id: 7, method: 'PUT' })).status, 403);
  const custom = { ...initial.body.template, name: 'قالب اختبار', ranges: [verseRange(114, 1, 6), verseRange(113, 1, 5), verseRange(112, 1, 4)] };
  assert.equal((await call('/automatic', custom, { method: 'PUT' })).status, 200);
  assert.equal((await call('/automatic', custom, { method: 'PUT' })).status, 409);
  assert.equal((await call('/automatic/4/preview', {}, { role: 'supervisor', id: 7 })).status, 403);
  assert.equal((await call('/automatic/999/preview', {})).status, 404);
  assert.equal((await call('/automatic/3/preview', { ranges: [{}] })).status, 422);
  const partial = await call('/automatic/3/preview', { priorMemorization: [verseRange(114, 2, 4)] }, { role: 'supervisor', id: 7 });
  assert.equal(partial.status, 200); assert.equal(partial.body.ranges.length, 4);
  assert.equal(partial.body.excludedAyahs, 3);
  const duplicate = await call('/automatic/3/preview', { ranges: [verseRange(114, 1, 6), verseRange(114, 2, 3)] });
  assert.equal(duplicate.status, 422);
  const startDate = shiftDateOnly(getBusinessDate(), 1);
  const payload = { ...verseRange(114, 1, 6), automatic: true, mode: 'new', track: 'memorization', startDate,
    dailyPages: 1, linkPages: 10, reviewHizbs: 1, readingHizbs: 3,
    queuedRanges: [verseRange(113, 1, 5), verseRange(112, 1, 4)], priorMemorization: [verseRange(114, 2, 4)] };
  assert.equal((await call('/student-plans/4', payload, { method: 'PUT', role: 'supervisor', id: 7 })).status, 403);
  const saved = await call('/student-plans/3', payload, { method: 'PUT' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const planId = Number(saved.body.id);
  let [[plan]] = await pool.query('SELECT * FROM student_quran_plans WHERE id=?', [planId]);
  assert.equal(plan.start_surah, 114); assert.equal(plan.start_ayah, 1); assert.equal(plan.end_ayah, 1);
  assert.equal(plan.queued_ranges_json[0].startAyah, 5); assert.equal(plan.queued_ranges_json[0].automatic, true);
  assert.equal((await call('/student-plans/3', { ...payload, mode: 'continue', automaticPlanId: 999 }, { method: 'PUT' })).status, 409);
  const currentPreview = await call('/automatic/3/preview', { currentPlanId: planId });
  assert.equal(currentPreview.status, 200);
  assert.ok(currentPreview.body.stages.some(item => item.reservedAyahs === 1));
  const continued = await call('/student-plans/3', { ...payload, mode: 'continue', automaticPlanId: planId,
    ...verseRange(114, 1, 1), priorMemorization: [], queuedRanges: currentPreview.body.ranges }, { method: 'PUT' });
  assert.equal(continued.status, 200, JSON.stringify(continued.body)); assert.equal(Number(continued.body.id), planId);
  [[plan]] = await pool.query('SELECT * FROM student_quran_plans WHERE id=?', [planId]);
  assert.equal(plan.start_ayah, 1); assert.equal(plan.end_ayah, 1);
  await pool.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,student_status)
    VALUES(?,3,?,'memorization',604,604,114,1,114,1,'done')`, [planId, startDate]);
  const approvalPreview = async () => call('/automatic/3/preview', { ranges: [verseRange(114, 1, 1)] });
  assert.equal((await approvalPreview()).body.ranges.length, 1, 'Student completion alone is not approved memorization');
  await pool.query('UPDATE student_quran_tasks SET teacher_completed=0 WHERE plan_id=?', [planId]);
  assert.equal((await approvalPreview()).body.ranges.length, 1, 'Rejected work remains available');
  await pool.query('UPDATE student_quran_tasks SET teacher_completed=1 WHERE plan_id=?', [planId]);
  assert.deepEqual((await approvalPreview()).body.ranges, [], 'Only approved execution is excluded');
  const addPrior = async (surah, from, to) => {
    const result = await call('/automatic/3/prior-memorization', { ranges: [verseRange(surah, from, to)] });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  };
  await addPrior(114, 5, 6); await addPrior(113, 2, 4); await addPrior(112, 1, 4);
  await pool.query("UPDATE student_quran_plans SET status='completed' WHERE id=?", [planId]);
  const activate = async id => {
    const connection = await pool.getConnection();
    try { await connection.beginTransaction(); const result = await activateQueuedQuranPlan(connection, { planId: id, startDate }); await connection.commit(); return result; }
    catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  };
  const nextId = await activate(planId);
  assert.ok(nextId > planId); assert.equal(await activate(planId), null);
  const [[successor]] = await pool.query('SELECT * FROM student_quran_plans WHERE id=?', [nextId]);
  assert.equal(successor.start_surah, 113); assert.equal(successor.start_ayah, 1); assert.equal(successor.end_ayah, 1);
  assert.equal(successor.daily_pages, 1); assert.equal(successor.reading_hizbs, 3);
  await pool.query("UPDATE student_quran_plans SET status='completed' WHERE id=?", [nextId]);
  const lastId = await activate(nextId);
  const [[last]] = await pool.query('SELECT * FROM student_quran_plans WHERE id=?', [lastId]);
  assert.equal(last.start_surah, 113); assert.equal(last.start_ayah, 5); assert.equal(last.end_ayah, 5);
  await pool.query("UPDATE student_quran_plans SET status='completed' WHERE id=?", [lastId]);
  assert.equal(await activate(lastId), null);
  const before = await pool.query('SELECT id,status FROM student_quran_plans ORDER BY id');
  const latestTemplate = (await call('/automatic')).body.template;
  assert.equal((await call('/automatic', { ...latestTemplate, name: 'قالب جديد' }, { method: 'PUT' })).status, 200);
  assert.deepEqual((await pool.query('SELECT id,status FROM student_quran_plans ORDER BY id'))[0], before[0]);
  const priorBody = { ranges: [verseRange(114, 1, 6)] };
  assert.equal((await call('/automatic/5/prior-memorization', priorBody)).body.addedRanges, 1);
  assert.equal((await call('/automatic/5/prior-memorization', priorBody)).body.addedRanges, 0);
  const full = await call('/automatic/5/preview', { ranges: [verseRange(114, 1, 6)] });
  assert.deepEqual(full.body.ranges, []);
  assert.equal((await call('/automatic/4/prior-memorization', priorBody, { role: 'supervisor', id: 7 })).status, 403);
  const [[none]] = await pool.query('SELECT COUNT(*) AS count FROM student_quran_plans WHERE student_id=5');
  assert.equal(none.count, 0);
  const [[history]] = await pool.query('SELECT teacher_completed,student_status,from_surah,from_ayah FROM student_quran_tasks WHERE plan_id=?', [planId]);
  assert.deepEqual(history, { teacher_completed: 1, student_status: 'done', from_surah: 114, from_ayah: 1 });
  console.log('Automatic plans MySQL/HTTP passed: real save and continuation, exact partial exclusion, scoped permissions, validation/rollback, revision conflicts, safe template updates, later prior exclusion, unique successors, inherited settings, exhaustion and idempotent prior-only saves.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool?.end();
  const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3310, user: process.env.MYSQL_USER || 'root', password: process.env.MYSQL_PASSWORD || '' });
  try { assert.match(database, /^nukhab_auto_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); }
  finally { await connection.end(); }
}
