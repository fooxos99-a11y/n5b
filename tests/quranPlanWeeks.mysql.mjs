import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import process from 'node:process';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { setTimeout } from 'node:timers/promises';
import { verifyWeeksEvidence } from './helpers/quranWeeksEvidence.mjs';

assert.equal(process.env.QURAN_TEST_MYSQL_DATABASE, 'quran_audit_weeks');
const db = await mysql.createConnection({ host: '127.0.0.1', port: 33316, user: 'root', database: process.env.QURAN_TEST_MYSQL_DATABASE });
const clock = 'outputs/quran-quality-audit/weeks-clock.txt';
async function setClock(value) {
  await writeFile(`${clock}.next`, value);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { await rename(`${clock}.next`, clock); return; }
    catch (error) {
      if (error.code !== 'EPERM' || attempt === 19) throw error;
      await setTimeout(25);
    }
  }
}
const registration = '909090';
async function api(route, token, body, method = body ? 'POST' : 'GET') {
  const response = await globalThis.fetch(`http://127.0.0.1:33312/api${route}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Nukhab-Native': '1', 'X-Registration-Number': registration,
      ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${route}: ${data.message}`);
  return data;
}
const login = (loginNumber) => api('/auth/login', null, { loginNumber, registrationNumber: registration });
const records = [];
const fixtures = [
  { name: 'daily', prior: [[2, 21]], start: 22, end: 80, skip: [] },
  { name: 'missed-days', prior: [[2, 21]], start: 22, end: 80, skip: [3, 4, 10, 18, 25] },
  { name: 'gaps', prior: [[2, 6], [12, 16], [23, 23]], start: 22, end: 80, skip: [] },
  { name: 'finish', prior: [[2, 21]], start: 22, end: 26, skip: [] },
  { name: 'plan-edit', prior: [[2, 21]], start: 22, end: 90, skip: [] },
];
const flatten = (tasks) => tasks.flatMap((task) => Array.from({ length: task.toPage - task.fromPage + 1 }, (_, i) => task.fromPage + i));
try {
  await setClock('2026-10-01T12:00:00Z');
  const manager = await login('909091');
  const settings = await api('/settings', manager.token);
  await api('/settings', manager.token, { ...settings, weeklyHolidayDays: [], recitationSessionDays: [0, 1, 2, 3, 4, 5, 6],
    recitationAmountDay: 'same_day', memorizationExecutionSource: 'both', reviewExecutionSource: 'both', linkExecutionSource: 'both',
    hideStudentAmounts: false }, 'PUT');
  const [committee] = await db.query('INSERT INTO committees (name) VALUES (?)', ['اختبار أربعة أسابيع']);
  for (const fixture of fixtures) {
    const number = `weeks-${crypto.randomBytes(8).toString('hex')}`;
    const [student] = await db.query('INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id) VALUES (?, ?, ?, ?, ?)',
      [fixture.name, number, number, '', committee.insertId]);
    fixture.id = student.insertId;
    fixture.number = number;
    fixture.saved = new Set(fixture.prior.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i)));
    fixture.plan = { startPage: fixture.start, endPage: fixture.end, dailyPages: 1, linkPages: 5, reviewPages: 5,
      priorMemorization: fixture.prior.map(([startPage, endPage]) => ({ startPage, endPage })) };
    await api(`/student-plans/${fixture.id}`, manager.token, fixture.plan, 'PUT');
  }
  for (let day = 0; day < 28; day += 1) {
    const date = `2026-10-${String(day + 1).padStart(2, '0')}`;
    await setClock(`${date}T12:00:00Z`);
    // Real sessions are renewed daily so expiry cannot mask plan behavior.
    const managerToday = await login('909091');
    for (const fixture of fixtures) {
      if (day === 14 && fixture.name === 'plan-edit') {
        fixture.plan.dailyPages = 2;
        await api(`/student-plans/${fixture.id}`, managerToday.token, fixture.plan, 'PUT');
      }
      const student = await login(fixture.number);
      const today = () => api(`/students/${fixture.id}/quran-today`, student.token);
      const initial = await today();
      assert.equal(initial.date, date);
      const expected = [];
      for (let page = fixture.start; page <= fixture.end && expected.length < fixture.plan.dailyPages; page += 1) {
        if (!fixture.saved.has(page)) expected.push(page);
      }
      const memory = initial.tasks.filter((task) => task.taskType === 'memorization');
      assert.deepEqual(flatten(memory), expected, `${fixture.name} ${date} first unmemorized pages`);
      const record = { scenario: fixture.name, date, previousMemorized: [...fixture.saved].sort((a, b) => a - b),
        expectedMemorization: expected, skipped: fixture.skip.includes(day), assignments: [] };
      for (const type of ['memorization', 'link', 'review']) {
        const data = await today();
        const tasks = data.tasks.filter((task) => task.taskType === type);
        const pages = flatten(tasks);
        record.assignments.push({ type, pages, ranges: tasks.map((task) => ({ from: [task.fromPage, task.fromSurah, task.fromAyah], to: [task.toPage, task.toSurah, task.toAyah] })) });
        if (type !== 'memorization') {
          for (const page of pages) assert.ok(fixture.saved.has(page), `${type} assigns unmemorized page ${page}`);
          assert.equal(new Set(pages).size, pages.length, `${type} duplicate pages`);
        }
        if (!tasks.length || record.skipped) continue;
        await api(`/students/${fixture.id}/quran-tasks/execution`, student.token, { taskIds: tasks.map((task) => task.id), status: 'done' });
        if (type === 'memorization') for (const page of pages) fixture.saved.add(page);
      }
      records.push(record);
    }
    process.stdout.write(`Day ${day + 1}/28 passed\n`);
  }
  verifyWeeksEvidence(records);
  const source = JSON.parse(await readFile('outputs/quran-quality-audit/source-comparison.json', 'utf8').catch(() => '{}'));
  await writeFile('outputs/quran-quality-audit/weeks-results.json', JSON.stringify({ days: 28, scenarios: fixtures.length, records, sourceVerses: source.verses }, null, 2));
} finally {
  await writeFile('outputs/quran-quality-audit/weeks-progress.json', JSON.stringify(records, null, 2));
  await db.end();
}
