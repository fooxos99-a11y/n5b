import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadStudentRecitationHistory } from '../server/services/studentRecitationHistory.js';
import { buildStudentSessionWeeks } from '../src/lib/studentPlan.js';

test('history student picker uses the teacher-scoped report endpoint allowed through account authorization', () => {
  const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../src/components/portal/TeacherPreviousSessionsPanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /studentsApi\.getReportStudents\(\)/);
  assert.doesNotMatch(panel, /studentsApi\.getStudents\(/);
  assert.match(server.slice(server.indexOf('const supervisorOwnReports'), server.indexOf('const supervisorExecutionFollowup')), /committees\|students\|/);
  const route = server.slice(server.indexOf("app.get('/api/reports/students'"), server.indexOf('async function buildSupervisorAttendanceReport'));
  assert.match(route, /requireReportsOrOwnCommittee/);
  assert.match(route, /sc.supervisor_id = \? AND sc.committee_id = s.committee_id/);
  assert.equal(server.split("app.get('/api/reports/students'").length - 1, 1);
});

test('student history requires teacher ownership before loading all years', async () => {
  const connection = { query: async (sql, values) => {
    assert.match(sql, /sc.supervisor_id = \?/);
    assert.match(sql, /a.is_official = 1/);
    assert.deepEqual(values, [13, 2]);
    return [[{ id: 2, firstDate: '2022-01-01' }]];
  } };
  const result = await loadStudentRecitationHistory(connection, { role: 'supervisor', id: 13 }, 2, async (options) => options);
  assert.equal(result.from, '2022-01-01');
  assert.equal(result.studentHistory, true);
  assert.equal(result.studentId, 2);
  await assert.rejects(loadStudentRecitationHistory({ query: async () => [[]] }, { role: 'supervisor', id: 13 }, 99, () => assert.fail('Out of scope')), { statusCode: 404 });
  await assert.rejects(loadStudentRecitationHistory(connection, { role: 'student', id: 13 }, 2), { statusCode: 403 });
  await assert.rejects(loadStudentRecitationHistory(connection, { role: 'supervisor', id: 13 }, '1 OR 1'), { statusCode: 422 });
});

test('student history preserves every attempt on its session date without inserting an empty today row', () => {
  const rows = [1, 2].map((id) => ({ id, taskId: 9, taskType: 'memorization', taskDate: '2022-01-01', sessionDate: '2022-01-03' }));
  const weeks = buildStudentSessionWeeks(rows);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].days.length, 1);
  assert.equal(weeks[0].days[0].date, '2022-01-03');
  assert.equal(weeks[0].days[0].tasks.length, 2);
  assert.deepEqual(buildStudentSessionWeeks([]), []);
});
