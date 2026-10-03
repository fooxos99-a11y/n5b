import test from 'node:test';
import assert from 'node:assert/strict';
import { gradePointsWereReset } from '../server/services/gradePointReset.js';
import { assertCommitteeNameAvailable, transferStudentCommittee } from '../server/services/committeeMaintenance.js';
import { assertStudentIdentityAvailable } from '../server/services/studentIdentity.js';
import { planScheduleDates } from '../server/services/planScheduleDates.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
import { buildOverviewRankings } from '../server/services/overviewRankings.js';
import { publicErrorMessage } from '../server/services/publicErrors.js';

test('students rank by total grades while circles compare percentages rather than circle size', async () => {
  const answers = [[], [{ id: 1, name: 'أ' }, { id: 2, name: 'ب' }], [], []];
  const db = { student: () => '1', committee: () => '1', staff: () => '1', query: async () => [answers.shift()] };
  const result = await buildOverviewRankings(db, { from: '2026-09-20', to: '2026-09-26', grades: {
    weeklyProgram: { studentsList: [
      { id: 1, name: 'طالب أول', committeeName: 'أ', grade: 40, max: 100 },
      { id: 2, name: 'طالب ثان', committeeName: 'ب', grade: 18, max: 20 },
    ] },
  } });
  assert.deepEqual(result.bestStudents.map(row => [row.id, row.grade]), [[1, 40], [2, 18]]);
  assert.deepEqual(result.bestCommittees.map(row => row.id), [2, 1]);
});

test('validation errors keep their message while SQL and server errors stay private', () => {
  assert.equal(publicErrorMessage({ status: 422, message: 'قيمة غير صحيحة' }), 'قيمة غير صحيحة');
  assert.notEqual(publicErrorMessage({ status: 422, message: 'secret sql', sql: 'SELECT private' }), 'secret sql');
  assert.notEqual(publicErrorMessage({ status: 500, message: 'internal' }), 'internal');
});

test('midweek reset blocks old recorded identities but permits a new result in that week', async () => {
  const connection = { query: async () => [[{ resetDate: '2026-09-23', resetKey: 0 }]] };
  assert.equal(await gradePointsWereReset(connection, 'grade:weekly:1:2026-09-20:weekly', '2026-09-20'), false);
  assert.equal(await gradePointsWereReset(connection, 'grade:weekly:1:2026-09-13:weekly', '2026-09-13'), true);
  assert.equal(await gradePointsWereReset(connection, 'grade:daily:1:2026-09-20:reading', '2026-09-20'), true);
  connection.query = async () => [[{ resetDate: '2026-09-23', resetKey: 1 }]];
  assert.equal(await gradePointsWereReset(connection, 'grade:weekly:1:2026-09-20:weekly', '2026-09-20'), true);
});

test('moving a student transfers their contribution while retaining independent circle points', async () => {
  const students = [{ id: 1, committeeId: 2, points: 15 }, { id: 2, committeeId: 2, points: 5 }, { id: 3, committeeId: 4, points: 9 }];
  const circles = new Map([[2, { points: 27, contribution: 20 }], [4, { points: 12, contribution: 9 }]]);
  const connection = { async query(sql, values) {
    if (sql.startsWith('SELECT committee_id')) return [[{ ...students.find(s => s.id === values[0]) }]];
    if (sql.startsWith('UPDATE students')) { students.find(s => s.id === values[1]).committeeId = values[0]; return [{}]; }
    if (sql.startsWith('SELECT id FROM committees')) return [[{ id: values[0] }]];
    if (sql.startsWith('SELECT COALESCE')) return [[{ points: students.filter(s => s.committeeId === values[0]).reduce((n,s) => n+s.points, 0) }]];
    if (sql.startsWith('UPDATE committees')) { const c = circles.get(values[2]); c.points = c.points - c.contribution + values[0]; c.contribution = values[1]; return [{}]; }
    throw Error(sql);
  } };
  await transferStudentCommittee(connection, 1, 4, { studentPointsAddToFamily: true });
  assert.deepEqual([...circles.values()], [{ points: 12, contribution: 5 }, { points: 27, contribution: 24 }]);
  await transferStudentCommittee(connection, 1, 4, { studentPointsAddToFamily: true });
  assert.equal(circles.get(4).points, 27);
});

test('schedule changes use frozen past work days and the new schedule in later weeks', async () => {
  const policy = normalizeGradingPolicy({ weeklyProgram: { workDays: [0, 1] } });
  const connection = { query: async () => [[{ weekStart: '2026-09-20', policy }]] };
  assert.deepEqual(await planScheduleDates(connection, '2026-09-20', '2026-09-30', [2, 3]), ['2026-09-20', '2026-09-21', '2026-09-29', '2026-09-30']);
});

test('duplicate identities and circle names are rejected before writing', async () => {
  const occupied = { query: async () => [[{id: 1}]] };
  await assert.rejects(assertStudentIdentityAvailable(occupied, '1234567890'), {status: 409});
  await assert.rejects(assertCommitteeNameAvailable(occupied, 'حلقة'), {status: 409});
  await assert.rejects(assertCommitteeNameAvailable(occupied, 'x'.repeat(161)), {status: 422});
});
