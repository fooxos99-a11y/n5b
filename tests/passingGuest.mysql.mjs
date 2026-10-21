import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import process from 'node:process';
import { createPassingGuestFixture } from './helpers/passingGuestFixture.mjs';
import { PASSING_LINK_KEY, passingTokenHash } from '../server/services/passingGuest.js';

const database = `nukhab_guest_test_${randomBytes(8).toString('hex')}`;
const { pool, app, linkToken, staffTokens } = await createPassingGuestFixture(database);
const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
let checks = 0;
const call = async (path, { token, link, body, staff, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) => {
  const response = await globalThis.fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Passing-Session': token } : {}), ...(link ? { 'X-Passing-Link': link } : {}),
      ...(staff ? { Cookie: `nukhab_session=${staff}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
const status = (response, expected) => { checks++; assert.equal(response.status, expected, JSON.stringify(response)); return response.body; };
const attempt = previousAttemptId => ({ mode: 'count', requestId: randomUUID(), previousAttemptId, mistakeCount: 1, warningCount: 2, hesitationCount: 3, actor: { role: 'manager', name: 'forged' } });
try {
  status(await call('/passing/guest/students'), 401);
  status(await call('/passing/guest/session', { link: '0'.repeat(64), body: { name: 'مقرئ محلي' } }), 403);
  status(await call('/passing/guest/session', { link: linkToken, body: { name: ' ' } }), 422);
  const session = status(await call('/passing/guest/session', { link: linkToken, body: { name: 'مقرئ محلي فعلي' } }), 201);
  const token = session.token;
  const otherSession = status(await call('/passing/guest/session', { link: linkToken, body: { name: 'المقرئ الثاني' } }), 201);
  const students = status(await call('/passing/guest/students', { token }), 200);
  assert.equal(students.length, 3); assert.deepEqual(Object.keys(students[0]).sort(), ['committeeId', 'committeeName', 'complexId', 'complexName', 'id', 'name'].sort());
  for (const [method, path] of [['GET', '/settings'], ['GET', '/students'], ['GET', '/notifications'], ['GET', '/dashboard-bootstrap'], ['POST', '/auth/logout'], ['POST', '/student-plans/pause'], ['GET', '/passing/policy'], ['GET', '/passing/guest/policy'], ['PUT', '/passing/guest/policy'], ['DELETE', '/passing/guest/parts/1']]) {
    status(await call(path, { token, method, staff: staffTokens.manager, ...(method === 'GET' ? {} : { body: {} }) }), 403);
  }
  status(await call('/passing/students', { headers: { Authorization: `Bearer ${token}` } }), 401);
  status(await call('/passing/guest/students', { staff: staffTokens.manager }), 401);
  status(await call('/passing/students', { staff: staffTokens.manager }), 200);
  status(await call('/passing/students/12/parts?type=branch', { staff: staffTokens.supervisor }), 403);
  assert.deepEqual(status(await call('/passing/guest/students/11/parts?type=branch', { token }), 200).parts.map(part => part.juzNumber), [1, 2]);
  assert.deepEqual(status(await call('/passing/guest/students/13/parts?type=branch', { token }), 200).parts, []);
  status(await call('/passing/guest/students/11/parts?type=invalid', { token }), 422);
  status(await call('/passing/guest/', { token, body: { studentId: 13, type: 'branch', juz: 1 } }), 422);
  const exam = status(await call('/passing/guest/', { token, body: { studentId: 11, type: 'branch', juz: 1 } }), 201), partId = exam.parts[0].id;
  status(await call('/passing/guest/', { token, body: { studentId: 11, type: 'branch', juz: 1 } }), 409);
  const mushaf = status(await call(`/passing/guest/parts/${partId}/segments/0/mushaf`, { token }), 200);
  assert.ok(mushaf.pages.length);
  status(await call(`/passing/guest/parts/${partId}/segments/999/mushaf`, { token }), 404);
  status(await call(`/passing/guest/parts/${partId}/attempts`, { token, body: { ...attempt(0), mistakeCount: -1 } }), 422);
  const payload = attempt(0);
  const results = await Promise.all([call(`/passing/guest/parts/${partId}/attempts`, { token, body: payload }), call(`/passing/guest/parts/${partId}/attempts`, { token, body: payload })]);
  const saved = status(results[0], 200).result; assert.deepEqual(results[0].body, status(results[1], 200)); assert.equal(saved.score, 93);
  const history = status(await call('/passing/students/11/parts?type=branch', { staff: staffTokens.manager }), 200).exams[0].parts[0];
  assert.equal(history.latestAttempt.actorName, 'مقرئ محلي فعلي'); assert.equal(history.attempts.length, 1);
  status(await call(`/passing/guest/parts/${partId}/rehifz`, { token, body: { attemptId: saved.attemptId + 999, repeat: true } }), 404);
  const decision = { attemptId: saved.attemptId, repeat: true };
  const choices = await Promise.all([call(`/passing/guest/parts/${partId}/rehifz`, { token, body: decision }), call(`/passing/guest/parts/${partId}/rehifz`, { token, body: decision })]);
  status(choices[0], 200); status(choices[1], 200);
  assert.equal((await pool.query('SELECT COUNT(*) AS count FROM student_passing_rehifz'))[0][0].count, 1);
  assert.equal((await pool.query('SELECT next_memorization_page FROM student_quran_plans WHERE id=11'))[0][0].next_memorization_page, 1);
  const notifications = status(await call('/notifications', { staff: staffTokens.manager }), 200);
  assert.equal(notifications.length, 1); assert.match(notifications[0].body, /مقرئ محلي فعلي/); assert.equal(notifications[0].action.studentId, 11);
  assert.equal(status(await call('/notifications', { staff: staffTokens.admin }), 200).length, 1);
  assert.equal(status(await call('/notifications', { staff: staffTokens.otherAdmin }), 200).length, 0);
  status(await call(`/passing/guest/parts/${partId}/rehifz`, { token, body: { attemptId: saved.attemptId, repeat: false } }), 409);
  const keepExam = status(await call('/passing/guest/', { token: otherSession.token, body: { studentId: 11, type: 'branch', juz: 2 } }), 201), keepPart = keepExam.parts[0].id;
  const keepAttempt = status(await call(`/passing/guest/parts/${keepPart}/attempts`, { token: otherSession.token, body: { ...attempt(0), mistakeCount: 4 } }), 200).result;
  assert.equal(keepAttempt.passed, false);
  status(await call(`/passing/guest/parts/${keepPart}/rehifz`, { token: otherSession.token, body: { attemptId: keepAttempt.attemptId, repeat: false } }), 200);
  const final = status(await call('/passing/students/11/parts?type=branch', { staff: staffTokens.manager }), 200);
  assert.equal(final.exams[0].parts[0].latestAttempt.actorName, 'المقرئ الثاني');
  assert.equal(final.exams[0].parts[0].latestAttempt.rehifzDecision, 'keep');
  assert.equal(status(await call('/notifications', { staff: staffTokens.manager }), 200).length, 2);
  await pool.query('UPDATE passing_guest_sessions SET expires_at=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE token_hash=?', [passingTokenHash(otherSession.token)]);
  status(await call('/passing/guest/students', { token: otherSession.token }), 401);
  await pool.query('UPDATE app_settings SET setting_value=? WHERE setting_key=?', [passingTokenHash('rotated'), PASSING_LINK_KEY]);
  status(await call('/passing/guest/students', { token }), 401);
  status(await call('/passing/guest/session', { link: linkToken, body: { name: 'مقرئ محلي' } }), 403);
  status(await call('/passing/students', { staff: staffTokens.manager }), 200);
  globalThis.console.log(`Passing guest real API/MySQL: ${checks} HTTP checks passed; shared history, server-scoped access, cookie isolation, duplicate protection, both decisions, notifications, expiry and revocation verified.`);
} finally {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await pool.end();
  const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD });
  try { assert.match(database, /^nukhab_guest_test_[a-f0-9]{16}$/); await connection.query(`DROP DATABASE \`${database}\``); } finally { await connection.end(); }
}
