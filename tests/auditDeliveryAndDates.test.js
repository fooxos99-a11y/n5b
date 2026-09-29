import assert from 'node:assert/strict';
import test from 'node:test';
import { sendWhatsAppOnce } from '../server/services/whatsAppOnce.js';
import { assertGradeDate } from '../server/services/gradeDateBoundary.js';
import { loadExpectedGrades, includeUnrecordedGrades } from '../server/services/expectedGrades.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
import { removeDeletedNewsCommittees } from '../server/services/studentNews.js';
import { assignRankingPositions } from '../shared/ranking-positions.js';
import { generateStudentLoginNumber } from '../shared/login-numbers.js';
import { isStaffWorkDay } from '../shared/staff-attendance.js';
import { attendanceForDay } from '../src/lib/staffAttendanceDay.js';

test('staff attendance does not reopen on holidays when a cached record advances to another day', () => {
  assert.equal(isStaffWorkDay('2026-10-02', [0, 1, 2, 3, 4]), false);
  assert.equal(attendanceForDay({ date: '2026-10-01', enabled: true, workDays: [0, 1, 2, 3, 4] }, '2026-10-02').canAttend, false);
});

test('equal scores share a rank and new generated logins have six digits', () => {
  assert.deepEqual(assignRankingPositions([{ points: 100 }, { points: 100 }, { points: 90 }]).map(row => row.rank), [1, 1, 3]);
  const used = new Set();
  for (let index = 0; index < 100; index++) assert.match(generateStudentLoginNumber(used), /^\d{6}$/);
  assert.equal(used.size, 100);
});

test('deleted news audiences can be edited without broadcasting to everyone', () => {
  const content = { entries: [{ id: 'a', committeeIds: [1, 2], enabled: true }, { id: 'b', committeeIds: [2], enabled: true }, { id: 'c', committeeIds: [], enabled: true }] };
  const result = removeDeletedNewsCommittees(content, [1]);
  assert.deepEqual(result.entries.map(row => [row.committeeIds, row.enabled]), [[[1], true], [[], false], [[], true]]);
  assert.deepEqual(content.entries[1].committeeIds, [2]);
});

function deliveryPool() {
  let receipt;
  let releases = 0;
  const connection = {
    query: async sql => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('SELECT id, status')) return [[...(receipt ? [receipt] : [])]];
      if (sql.includes('INSERT INTO')) { receipt = { id: 7, status: 'prepared' }; return [{ insertId: 7 }]; }
      if (sql.includes('UPDATE whatsapp_messages')) receipt.status = 'sent';
      return [[]];
    },
    release: () => { releases++; },
  };
  return { getConnection: async () => connection, releases: () => releases };
}

test('successful WhatsApp retries reuse the receipt without a second external send', async () => {
  const pool = deliveryPool();
  let sends = 0;
  const request = { phone: 'test', message: 'test', send: async () => { sends++; } };
  assert.equal(await sendWhatsAppOnce(pool, request), 7);
  assert.equal(await sendWhatsAppOnce(pool, request), 7);
  assert.equal(sends, 1);
  assert.equal(pool.releases(), 2);
});

test('uncertain WhatsApp delivery is not silently resent', async () => {
  const pool = deliveryPool();
  let sends = 0;
  const request = { phone: 'test', message: 'test', send: async () => { sends++; throw new Error('disconnected'); } };
  await assert.rejects(sendWhatsAppOnce(pool, request), /disconnected/);
  await assert.rejects(sendWhatsAppOnce(pool, request), /لم يتأكد/);
  assert.equal(sends, 1);
  assert.equal(pool.releases(), 2);
});

test('grade dates reject invalid, future, pre-enrollment and closed-term dates', async () => {
  const db = { query: async () => [[{ joined: '2026-09-22', termStart: '2026-09-20', resetDate: '2026-09-23' }]] };
  const options = { today: '2026-09-28' };
  for (const date of ['2026-02-30', '2026-09-29', '2026-09-19', '2026-09-22']) {
    await assert.rejects(assertGradeDate(db, 1, date, options), { status: 422 });
  }
  await assertGradeDate(db, 1, '2026-09-28', options);
});

test('expected grades count unrecorded students, skip future days and honor enrollment', async () => {
  const policy = normalizeGradingPolicy({});
  const answers = [[[ { id: 1, joined: '2026-09-20' }, { id: 2, joined: '2026-09-28' } ]], [[]]];
  const db = { student: () => '1=1', query: async () => answers.shift() };
  const students = await loadExpectedGrades(db, { from: '2026-09-27', to: '2026-10-03', today: '2026-09-28', policy });
  const daily = policy.weeklyProgram.attendance.present + policy.weeklyProgram.memorizationDaily + policy.weeklyProgram.linkDaily + policy.weeklyProgram.reviewDaily + policy.weeklyProgram.readingDaily;
  assert.equal(students[0].programMax, daily * 2);
  assert.equal(students[1].programMax, daily);
  const rows = includeUnrecordedGrades(students, [{ id: 1, grade: daily }], 'program');
  assert.equal(rows[1].grade, 0);
  assert.equal(rows.reduce((sum, row) => sum + row.max, 0), daily * 3);
});
