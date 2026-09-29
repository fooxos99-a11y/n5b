import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import mysql from 'mysql2/promise';
import { selectReviewFaces } from '../shared/quran-review-cycle.js';
import { getReviewStartForDate } from '../server/services/quranReviewSchedule.js';
const database = process.env.QURAN_TEST_MYSQL_DATABASE;
assert.match(database || '', /^quran_audit_[a-z0-9_]+$/);
const base = process.env.QURAN_TEST_API_URL;
assert.equal(new globalThis.URL(base).hostname, '127.0.0.1');
const registration = process.env.QURAN_TEST_REGISTRATION;
const db = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT), user: process.env.QURAN_TEST_MYSQL_USER, database });
async function api(path, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await globalThis.fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Nukhab-Native': '1', 'X-Registration-Number': registration,
    ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${result.message || response.status}`);
  return result;
}
const login = loginNumber => api('/auth/login', null, { loginNumber, registrationNumber: registration });
try {
  const manager = await login(process.env.QURAN_TEST_MANAGER_LOGIN);
  const run = crypto.randomBytes(5).toString('hex');
  const [committee] = await db.query('INSERT INTO committees (name) VALUES (?)', [`اختبار دوران ${run}`]);
  const [studentRow] = await db.query('INSERT INTO students (name,login_number,national_id,guardian_phone,committee_id) VALUES (?,?,?,?,?)', [`اختبار مراجعة ${run}`, run, run, '', committee.insertId]);
  const id = studentRow.insertId;
  await api(`/student-plans/${id}`, manager.token, { startPage: 22, endPage: 40, dailyPages: 1, linkPages: 5, reviewPages: 5,
    priorMemorization: [{ startPage: 2, endPage: 21 }] }, 'PUT');
  const student = await login(run);
  const today = () => api(`/students/${id}/quran-today`, student.token);
  const data = await today();
  assert.ok(data.reviewCycle.ayahs.length);
  const review = data.tasks.filter(task => task.taskType === 'review');
  const path = selectReviewFaces(data.reviewCycle, 20);
  assert.ok(path.ranges.length > 1, 'quantity must wrap');
  const execute = (faces, status = 'done', expected = 200) => api(`/students/${id}/quran-tasks/execution`, student.token,
    { taskIds: review.map(task => task.id), status, reviewFaces: faces }, 'POST', expected);
  const points = async () => Number((await db.query('SELECT COALESCE(SUM(points),0) AS points FROM student_point_transactions WHERE student_id = ?', [id]))[0][0].points);
  await execute(5);
  const fullPoints = await points();
  assert.ok(fullPoints > 0);
  await execute(20);
  assert.equal(await points(), fullPoints);
  const after = await today();
  const saved = after.tasks.find(task => task.reviewExecution)?.reviewExecution;
  assert.deepEqual(saved.ranges, path.ranges);
  await execute(20);
  assert.equal(await points(), fullPoints, 'retry is idempotent');
  const nextDate = new Date(`${data.date}T12:00:00Z`); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  assert.equal(await getReviewStartForDate(db, data.plan, nextDate.toISOString().slice(0, 10)), saved.next.page);
  await execute(2.5);
  assert.equal(await points(), fullPoints / 2);
  await execute(0, 'done', 422);
  await execute(20, 'not_done');
  assert.equal(await points(), 0);
  assert.ok((await today()).tasks.filter(task => task.taskType === 'review').every(task => !task.reviewExecution));
  globalThis.console.log('Isolated MySQL/API: cyclic path, capped/reduced points, retry, next-day cursor and undo passed.');
} finally { await db.end(); }
