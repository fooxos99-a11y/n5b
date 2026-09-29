import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { getReviewStartForDate } from '../server/services/quranReviewSchedule.js';
import { shiftDateOnly } from '../shared/business-date.js';

// Opt-in integration test. Supply an isolated API and disposable local database;
// never load the application's environment or use an operational database.
const base = process.env.QURAN_TEST_API_URL;
const database = process.env.QURAN_TEST_MYSQL_DATABASE;
assert.ok(base && database && process.env.QURAN_TEST_MYSQL_USER, 'Explicit isolated Quran test configuration is required');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
assert.match(database, /^quran_audit(?:_[a-z0-9_]+)?$/);
const registration = process.env.QURAN_TEST_REGISTRATION;
const runId = crypto.randomBytes(6).toString('hex');
const output = `outputs/quran-quality-audit/run-${runId}`;
const connection = await mysql.createConnection({
  host: '127.0.0.1', port: Number(process.env.QURAN_TEST_MYSQL_PORT),
  user: process.env.QURAN_TEST_MYSQL_USER,
  password: process.env.QURAN_TEST_MYSQL_PASSWORD || '', database,
});
const evidence = [];

async function api(path, token, body, method = body ? 'POST' : 'GET', expected = 200) {
  const response = await globalThis.fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json', 'X-Nukhab-Native': '1',
      'X-Registration-Number': registration,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${result.message || response.status}`);
  return result;
}

const login = (loginNumber) => api('/auth/login', null, { loginNumber, registrationNumber: registration });
const snapshot = (data) => data.tasks.filter((row) => row.taskType !== 'repeat').map((row) => ({
  type: row.taskType, fromPage: row.fromPage, toPage: row.toPage,
  fromSurah: row.fromSurah, fromAyah: row.fromAyah, toSurah: row.toSurah, toAyah: row.toAyah,
  faces: row.targetPages, status: row.studentStatus,
}));
const ranges = (data, type) => data.tasks.filter((row) => row.taskType === type)
  .map((row) => [row.fromPage, row.toPage]);

async function createStudent(manager, committeeId, scenario) {
  const number = `audit-${runId}-${evidence.length}-${crypto.randomBytes(3).toString('hex')}`;
  const [result] = await connection.query(
    'INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id) VALUES (?, ?, ?, ?, ?)',
    [scenario.name, number, number, '', committeeId],
  );
  const plan = await api(`/student-plans/${result.insertId}`, manager.token, {
    startPage: 22, endPage: 40, dailyPages: 1, linkPages: 5, reviewPages: 5,
    priorMemorization: scenario.prior.map(([startPage, endPage]) => ({ startPage, endPage })),
    ...scenario.plan,
  }, 'PUT');
  const student = await login(number);
  return { id: result.insertId, planId: plan.id, token: student.token, scenario };
}

const todayFor = (student) => api(`/students/${student.id}/quran-today`, student.token);
const execute = (student, tasks, extra = {}, expected = 200) => api(
  `/students/${student.id}/quran-tasks/execution`, student.token,
  { taskIds: tasks.map((task) => task.id), status: 'done', ...extra }, 'POST', expected,
);

async function pageEnd(page) {
  const [[position]] = await connection.query(
    'SELECT page_number AS page, surah_number AS surah, ayah_number AS ayah FROM quran_ayah_pages WHERE page_number = ? ORDER BY surah_number DESC, ayah_number DESC LIMIT 1', [page],
  );
  return position;
}

async function verifyPersisted(student, data) {
  const [rows] = await connection.query(
    `SELECT id, task_type AS taskType, from_page AS fromPage, to_page AS toPage,
      from_surah AS fromSurah, from_ayah AS fromAyah, to_surah AS toSurah, to_ayah AS toAyah,
      student_status AS studentStatus FROM student_quran_tasks WHERE student_id = ? AND task_date = ?`,
    [student.id, data.date],
  );
  for (const row of rows) {
    const task = data.tasks.find((item) => item.id === row.id);
    assert.ok(task, `Stored task ${row.id} must appear in the API`);
    for (const key of Object.keys(row)) assert.equal(task[key], row[key], key);
  }
  assert.equal(rows.length, data.tasks.length);
}

async function verifyScenario(manager, committeeId, scenario) {
  const student = await createStudent(manager, committeeId, scenario);
  const initial = await todayFor(student);
  for (const [type, expected] of Object.entries(scenario.expected)) assert.deepEqual(ranges(initial, type), expected, scenario.name);
  await verifyPersisted(student, initial);
  const review = initial.tasks.filter((task) => task.taskType === 'review');
  if (review.length && scenario.name === 'محفوظ متصل') {
    await execute(student, review, { actualEnd: await pageEnd(7) }, 422);
  }
  for (const type of ['memorization', 'link', 'review']) {
    const current = await todayFor(student);
    const tasks = current.tasks.filter((task) => task.taskType === type);
    if (!tasks.length) continue;
    await execute(student, tasks);
    const [before] = await connection.query('SELECT points, dedupe_key FROM student_point_transactions WHERE student_id = ? ORDER BY id', [student.id]);
    await Promise.all([execute(student, tasks), execute(student, tasks)]);
    const [after] = await connection.query('SELECT points, dedupe_key FROM student_point_transactions WHERE student_id = ? ORDER BY id', [student.id]);
    assert.deepEqual(after, before, 'Repeated execution must not duplicate or change ledger entries');
  }
  const completed = await todayFor(student);
  await verifyPersisted(student, completed);
  assert.ok(completed.tasks.every((task) => task.studentStatus === 'done'));
  const relogged = await login((await connection.query('SELECT login_number AS number FROM students WHERE id = ?', [student.id]))[0][0].number);
  assert.deepEqual(snapshot(await todayFor({ ...student, token: relogged.token })), snapshot(completed));
  evidence.push({ name: scenario.name, priorPages: scenario.prior, before: snapshot(initial), after: snapshot(completed),
    tomorrow: completed.nextDay?.tasks.map(({ taskType, fromPage, toPage, fromSurah, fromAyah, toSurah, toAyah }) => ({ taskType, fromPage, toPage, fromSurah, fromAyah, toSurah, toAyah })),
    checks: ['API matches MySQL', 'concurrent replay preserves ledger', 'relogin preserves execution'] });
  return student;
}

async function teacherEvaluate(teacher, student, task, date, mistakeCount = 0) {
  await connection.query('INSERT IGNORE INTO attendance_records (student_id, record_date, status) VALUES (?, ?, ?)', [student.id, date, 'present']);
  const body = { date, mistakeCount, warningCount: 0, requestId: `audit-${runId}-${task.id}-${mistakeCount}` };
  const path = `/supervisors/${teacher.id}/quran-evaluation/${task.id}`;
  const result = await api(path, teacher.token, body);
  await api(path, teacher.token, body);
  const [[count]] = await connection.query('SELECT COUNT(*) AS count FROM student_quran_recitation_attempts WHERE task_id = ?', [task.id]);
  assert.equal(count.count, 1, 'Repeated teacher request must produce one attempt');
  return result;
}

async function verifyPartialReview(manager, committeeId, teacher) {
  for (const completePage of [false, true]) {
    const student = await createStudent(manager, committeeId, { name: 'مراجعة جزئية مع اعتماد المعلم', prior: [[2, 21]] });
    const initial = await todayFor(student);
    const task = initial.tasks.find((row) => row.taskType === 'review');
    const actualEnd = await pageEnd(4);
    if (!completePage) actualEnd.ayah -= 1;
    await execute(student, [task], { actualEnd });
    const result = await teacherEvaluate(teacher, student, task, initial.date);
    assert.equal(result.teacherCompleted, true);
    const nextPage = await getReviewStartForDate(connection, { id: student.planId, startPage: 22 }, shiftDateOnly(initial.date, 1));
    assert.equal(nextPage, completePage ? 5 : 4);
    evidence.push({ name: completePage ? 'مراجعة حتى نهاية الصفحة 4 ثم اعتماد المعلم' : 'مراجعة حتى وسط الصفحة 4 ثم اعتماد المعلم',
      priorPages: [[2, 21]], assignedReview: [2, 6], actualEnd, expectedNextPage: completePage ? 5 : 4, actualNextPage: nextPage,
      checks: ['real student execution', 'real teacher approval', 'one attempt on replay', 'unfinished review remains required'] });
  }
}

async function verifyPartialMemorization(manager, committeeId, teacher) {
  const student = await createStudent(manager, committeeId, { name: 'حفظ جزئي ثم رفض المعلم', prior: [[2, 21]] });
  const initial = await todayFor(student);
  const task = initial.tasks.find((row) => row.taskType === 'memorization');
  await execute(student, [task], { actualEnd: { page: 22, surah: 2, ayah: 143 } });
  const [[partial]] = await connection.query('SELECT next_memorization_ayah AS ayah FROM student_quran_plans WHERE id = ?', [student.planId]);
  assert.equal(partial.ayah, 144);
  const result = await teacherEvaluate(teacher, student, task, initial.date, 1000);
  assert.equal(result.teacherCompleted, false);
  const [[rejected]] = await connection.query('SELECT next_memorization_ayah AS ayah FROM student_quran_plans WHERE id = ?', [student.planId]);
  assert.equal(rejected.ayah, 142);
  evidence.push({ name: 'حفظ البقرة 142–143 ثم رفض المعلم', priorPages: [[2, 21]], afterStudentNextAyah: partial.ayah,
    afterRejectionNextAyah: rejected.ayah, checks: ['partial memorization resumes at first gap', 'teacher rejection removes accepted progress', 'one attempt on replay'] });
}

try {
  await mkdir(output, { recursive: true });
  const manager = await login(process.env.QURAN_TEST_MANAGER_LOGIN);
  const settings = await api('/settings', manager.token);
  await api('/settings', manager.token, { ...settings, weeklyHolidayDays: [], recitationSessionDays: [0, 1, 2, 3, 4, 5, 6],
    recitationAmountDay: 'same_day', memorizationExecutionSource: 'both', reviewExecutionSource: 'both', linkExecutionSource: 'both',
    studentTaskAmountEditable: true, studentReviewAmountEditable: true, pointsSystemEnabled: true, maxDailyStudentPoints: 10000,
    hideStudentAmounts: false, hideStudentMemorizationAmount: false, hideStudentReviewAmount: false, hideStudentLinkAmount: false,
  }, 'PUT');
  const [committee] = await connection.query('INSERT INTO committees (name) VALUES (?)', [`اختبار المصحف ${runId}`]);
  const teacherNumber = `teacher-${runId}`;
  const [teacherRow] = await connection.query('INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role) VALUES (?, ?, ?, ?, ?, ?)',
    ['معلم اختبار المصحف', teacherNumber, teacherNumber, '', 'معلم', 'supervisor']);
  await connection.query('INSERT INTO supervisor_committees (supervisor_id, committee_id) VALUES (?, ?)', [teacherRow.insertId, committee.insertId]);
  const teacher = await login(teacherNumber);
  const scenarios = [
    { name: 'محفوظ متصل', prior: [[2, 21]], expected: { memorization: [[22, 22]], link: [[17, 21]], review: [[2, 6]] } },
    { name: 'محفوظ متقطع', prior: [[2, 6], [12, 16]], expected: { memorization: [[22, 22]], link: [[12, 16]], review: [[2, 6]] } },
    { name: 'بدون محفوظ سابق', prior: [], expected: { memorization: [[22, 22]], link: [], review: [] } },
    // Review starts at the plan page, visits saved page 23, then wraps to 2–5.
    { name: 'فجوة داخل الخطة', prior: [[2, 21], [23, 23]], expected: { memorization: [[22, 22]], link: [[17, 21]], review: [[2, 5], [23, 23]] } },
    { name: 'خطة عكسية', prior: [[602, 604]], plan: { startPage: 601, endPage: 590, linkPages: 1, reviewPages: 1 },
      expected: { memorization: [[601, 601]], link: [[602, 603]], review: [[604, 604]] } },
  ];
  for (const scenario of scenarios) await verifyScenario(manager, committee.insertId, scenario);
  await verifyPartialReview(manager, committee.insertId, teacher);
  await verifyPartialMemorization(manager, committee.insertId, teacher);
  await writeFile(`${output}/results.json`, JSON.stringify({ database, runId, evidence }, null, 2));
  process.stdout.write(`Quran MySQL/API audit: ${evidence.length} scenarios passed. ${output}/results.json\n`);
} finally {
  await connection.end();
}

