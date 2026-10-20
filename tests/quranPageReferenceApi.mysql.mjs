import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import process from 'node:process';
import mysql from 'mysql2/promise';
import { upReferenceRepair } from '../server/services/quranReferenceRepair.js';
import { hashStudentPassword } from '../server/services/studentPassword.js';

const database = `${process.env.QURAN_TEST_MYSQL_DATABASE}_api`;
assert.match(database, /^quran_audit_page_reference_[a-z0-9_]+_api$/);
assert.equal(process.env.QURAN_TEST_MYSQL_HOST, '127.0.0.1');
const registration = '928201';
const password = 'Local-page-reference-test-2026';
const clockFile = path.resolve('outputs/quran-quality-audit', `${database}.clock`);
await mkdir(path.dirname(clockFile), { recursive: true });
await writeFile(clockFile, '2026-10-19T10:00:00Z');
const socket = net.createServer();
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port;
await new Promise(resolve => socket.close(resolve));
const base = `http://127.0.0.1:${port}/api`;
const apiProcess = spawn(process.execPath, ['tests/helpers/quranAuditApi.mjs'], {
  env: { ...process.env, QURAN_TEST_MYSQL_DATABASE: database, QURAN_TEST_API_PORT: String(port),
    QURAN_TEST_REGISTRATION: registration, QURAN_TEST_MANAGER_LOGIN: '928202', QURAN_TEST_CLOCK_FILE: clockFile },
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
apiProcess.stdout.on('data', data => { log = (log + data).slice(-12000); });
apiProcess.stderr.on('data', data => { log = (log + data).slice(-12000); });
const wait = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));
const memorizationTasks = data => data.todayAmounts.filter(row => row.taskType === 'memorization');
async function api(route, token, body, expected = 200, method = body ? 'POST' : 'GET') {
  const response = await globalThis.fetch(base + route, { method,
    headers: { 'Content-Type': 'application/json', 'X-Nukhab-Native': '1', 'X-Registration-Number': registration,
      ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  assert.equal(response.status, expected, `${route}: ${JSON.stringify(value)}`);
  return value;
}
let connection;
try {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (apiProcess.exitCode != null) throw new Error(`Isolated API exited: ${log.slice(-2000)}`);
    try { const r = await globalThis.fetch(base + '/health', { signal: globalThis.AbortSignal.timeout(1500) }); if (r.ok) break; }
    catch (error) { if (attempt === 599) throw new Error(`Isolated API did not start: ${log.slice(-1500)}`, { cause: error }); }
    await wait(400);
  }
  connection = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT),
    user: process.env.QURAN_TEST_MYSQL_USER, password: process.env.QURAN_TEST_MYSQL_PASSWORD || '', database, dateStrings: true });
  const passwordHash = await hashStudentPassword(password);
  await connection.query("INSERT INTO supervisors(name,login_number,national_id,phone,job_title,role,password_hash) VALUES('مدير اختبار الوجه','928202','','','مدير','manager',?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)", [passwordHash]);
  const manager = await api('/auth/login', null, { registrationNumber: registration, loginNumber: '928202', password });
  process.stdout.write('Isolated API ready; verifying student assignments.\n');
  assert.ok(manager.token, JSON.stringify(manager));
  const settings = await api('/settings', manager.token);
  await api('/settings', manager.token, { ...settings, weeklyHolidayDays: [], recitationSessionDays: [0,1,2,3,4,5,6], workDays: [0,1,2,3,4,5,6] }, 200, 'PUT');
  const [committee] = await connection.query("INSERT INTO committees(name) VALUES('حلقة اختبار حدود الوجه')");
  const scenarios = [];
  for (const [name, lastAccepted] of [['أول آية غير مسمعة',130], ['أول آية معتمدة سابقًا',131]]) {
    const login = `page-${lastAccepted}`;
    const [student] = await connection.query('INSERT INTO students(name,login_number,national_id,guardian_phone,committee_id,password_hash) VALUES(?,?,?,\'\',?,?)', [name,login,login,committee.insertId,passwordHash]);
    const plan = await api(`/student-plans/${student.insertId}`, manager.token, {
      startPage: 144, startSurah: 6, startAyah: 125, endPage: 146, endSurah: 6, endAyah: 142,
      dailyPages: 1, linkPages: 1, reviewPages: 1, startDate: '2026-10-19', scheduleDays: [0,1,2,3,4,5,6], priorMemorization: [],
    }, 200, 'PUT');
    await connection.query('DELETE FROM student_quran_tasks WHERE student_id=?', [student.insertId]);
    const [approved] = await connection.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages,student_status,teacher_completed,executed_at,evaluated_at,execution_state,actual_to_page,actual_to_surah,actual_to_ayah)
      VALUES(?,?,'2026-10-19','memorization',144,144,6,125,6,?,1,'done',1,'2026-10-19 10:00:00','2026-10-19 10:00:00','complete',144,6,?)`, [plan.id,student.insertId,lastAccepted,lastAccepted]);
    await connection.query(`INSERT INTO student_quran_tasks(plan_id,student_id,task_date,task_type,from_page,to_page,from_surah,from_ayah,to_surah,to_ayah,target_pages)
      VALUES(?,?,'2026-10-20','memorization',145,145,6,132,6,137,1)`, [plan.id,student.insertId]);
    const [[before]] = await connection.query('SELECT * FROM student_quran_tasks WHERE id=?', [approved.insertId]);
    const account = await api('/auth/login', null, { registrationNumber: registration, loginNumber: login, password });
    assert.ok(account.token);
    scenarios.push({ studentId: student.insertId, token: account.token, lastAccepted, approvedId: approved.insertId, before });
  }
  await writeFile(clockFile, '2026-10-20T10:00:00Z');
  await upReferenceRepair(connection, 'test-api-page-reference', '2026-10-20');
  for (const scenario of scenarios) {
    await api(`/students/${scenario.studentId}/quran-today`, null, undefined, 401);
    const today = await api(`/students/${scenario.studentId}/quran-today`, scenario.token);
    const tasks = memorizationTasks(today);
    assert.equal(tasks.length, 1, JSON.stringify(tasks));
    assert.equal(tasks[0].fromAyah, scenario.lastAccepted + 1);
    assert.equal(tasks[0].toAyah, 137);
    assert.equal(tasks[0].facePortion, scenario.lastAccepted === 131 ? 'remainder' : null);
    assert.equal(tasks[0].targetPages, scenario.lastAccepted === 131 ? 0.75 : 1);
    const again = await api(`/students/${scenario.studentId}/quran-today`, scenario.token);
    assert.deepEqual(memorizationTasks(again).map(row => row.id), tasks.map(row => row.id));
    const [[after]] = await connection.query('SELECT * FROM student_quran_tasks WHERE id=?', [scenario.approvedId]);
    assert.deepEqual(after, scenario.before, 'Approved task must remain byte-for-byte unchanged');
    await connection.query("UPDATE student_quran_tasks SET teacher_completed=1,student_status='done',execution_state='complete',actual_to_page=to_page,actual_to_surah=to_surah,actual_to_ayah=to_ayah,executed_at='2026-10-20 10:00:00',evaluated_at='2026-10-20 10:00:00' WHERE id=?", [tasks[0].id]);
  }
  await api(`/students/${scenarios[1].studentId}/quran-today`, scenarios[0].token, undefined, 403);
  await writeFile(clockFile, '2026-10-21T10:00:00Z');
  for (const scenario of scenarios) {
    const next = await api(`/students/${scenario.studentId}/quran-today`, scenario.token);
    const tasks = memorizationTasks(next);
    assert.equal(tasks[0]?.fromPage, 146, JSON.stringify(tasks));
    assert.equal(tasks[0].fromAyah, 138);
    assert.equal(tasks[0].toAyah, 142);
    assert.equal(tasks[0].facePortion, null);
  }
  process.stdout.write(`${JSON.stringify({ database, actualApi: true, missingFirstAyahRestored: true, acceptedAyahNotRepeated: true,
    sameDayStable: true, nextDayContinuous: true, approvedRowsUnchanged: true, unauthorizedDenied: true })}\n`);
} catch (error) {
  await writeFile('outputs/quran-page-reference-20261020/api-private.log', log);
  throw error;
} finally {
  if (connection) await connection.end();
  if (apiProcess.exitCode == null) apiProcess.kill();
  await new Promise(resolve => apiProcess.exitCode != null ? resolve() : apiProcess.once('exit', resolve));
  await unlink(clockFile);
}
