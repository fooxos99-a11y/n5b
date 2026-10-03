import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverviewRankings } from '../server/services/overviewRankings.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

test('all students, circles and complexes rank without a top-ten limit or same-name mixing', async () => {
  const circles = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, name: 'حلقة مكررة', complexId: index < 6 ? 1 : 2 }));
  circles.push({ id: 13, name: 'حلقة فارغة', complexId: 2 });
  const students = circles.slice(0, 12).flatMap(circle => [
    { id: circle.id * 2, name: `طالب ${circle.id}`, committeeId: circle.id, committeeName: circle.name, grade: 0 },
    { id: circle.id * 2 + 1, name: `طالب جديد ${circle.id}`, committeeId: circle.id, committeeName: circle.name, grade: 0 },
  ]);
  const answers = [students, circles, [{ id: 1, name: 'الأول' }, { id: 2, name: 'الثاني' }, { id: 3, name: 'فارغ' }], [], []];
  const reportDb = { student: () => '1', committee: () => '1', staff: () => '1', complex: () => '1', query: async () => [answers.shift()] };
  const result = await buildOverviewRankings(reportDb, { from: '2026-09-20', to: '2026-09-26', grades: { weeklyProgram: {
    studentsList: circles.slice(0, 12).map(circle => ({ id: circle.id * 2, name: `طالب ${circle.id}`, committeeId: circle.id, committeeName: circle.name, grade: circle.id, max: 20 })),
  } } });
  assert.equal(result.bestStudents.length, 24);
  assert.equal(result.bestCommittees.length, 13);
  assert.equal(result.bestComplexes.length, 3);
  assert.equal(result.bestStudents[0].id, 24);
  assert.equal(result.bestStudents.at(-1).percentage, null);
  assert.equal(result.bestCommittees.find(circle => circle.id === 1).percentage, 5);
  assert.equal(result.bestCommittees.find(circle => circle.id === 12).percentage, 60);
  assert.equal(result.bestCommittees.find(circle => circle.id === 13).percentage, null);
  assert.equal(result.bestComplexes.find(complex => complex.id === 1).percentage, 18);
  assert.equal(result.bestComplexes.find(complex => complex.id === 2).percentage, 48);
  assert.equal(result.bestComplexes.find(complex => complex.id === 3).percentage, null);
  assert.equal(result.bestComplexes.find(complex => complex.id === 2).committeesCount, 7);
});

test('complex ranking weights earned and expected grades rather than averaging circle percentages', async () => {
  const answers = [[], [{ id: 1, name: 'كبيرة', complexId: 1 }, { id: 2, name: 'صغيرة', complexId: 1 }], [{ id: 1, name: 'مجمع' }], [], []];
  const reportDb = { student: () => '1', committee: () => '1', staff: () => '1', complex: () => '1', query: async () => [answers.shift()] };
  const result = await buildOverviewRankings(reportDb, { from: '2026-09-20', to: '2026-09-26', grades: { weeklyProgram: { studentsList: [
    { id: 1, name: 'الأول', committeeId: 1, grade: 90, max: 100 },
    { id: 2, name: 'الثاني', committeeId: 2, grade: 0, max: 10 },
  ] } } });
  assert.equal(result.bestComplexes[0].percentage, 82);
  assert.equal(result.bestComplexes[0].studentsCount, 2);
});

test('student ranking totals every grade component including narration rather than ordering percentages', async () => {
  const answers = [[{ id: 1, name: 'الأول', committeeId: 1 }, { id: 2, name: 'الثاني', committeeId: 2 }],
    [{ id: 1, name: 'أ' }, { id: 2, name: 'ب' }], [], []];
  const calls = [];
  const reportDb = { student: () => '1', committee: () => '1', staff: () => '1', query: async (sql, values) => {
    calls.push({ sql, values }); return [answers.shift()];
  } };
  const result = await buildOverviewRankings(reportDb, { from: '2026-09-20', to: '2026-09-26', grades: {
    weeklyProgram: { studentsList: [{ id: 1, grade: 40, max: 100 }, { id: 2, grade: 18, max: 20 }] },
    weeklySession: { studentsList: [{ id: '1', grade: 10.5, max: 20 }] },
    trackSession: { studentsList: [{ id: 1, grade: 5, max: 10 }] },
    narration: { studentsList: [{ id: 1, grade: 4.75 }, { id: 2, grade: 20 }] },
  } });
  assert.deepEqual(result.bestStudents.map(row => [row.id, row.grade]), [[1, 60.25], [2, 38]]);
  assert.deepEqual(result.bestCommittees.map(row => row.id), [2, 1]);
  assert.deepEqual(calls[0].values, ['2026-09-20', '2026-09-26']);
  assert.match(calls[0].sql, /transaction_date BETWEEN \? AND \?/);
});

test('complex scope preserves empty selected complexes and restricts teacher and circle access', async () => {
  const calls = [];
  const connection = { query: async (sql, values) => { calls.push({ sql, values }); return [[]]; } };
  const teacher = createOverviewReportScope(connection, { auth: { role: 'supervisor', id: 7 }, complexId: 2, committeeId: 9 });
  await teacher.query(`SELECT cx.id FROM complexes cx WHERE ${teacher.complex('cx.id')}`);
  assert.deepEqual(calls[0].values, [2, 7, 9, 2]);
  assert.match(calls[0].sql, /overview_circle.complex_id = cx.id/);
  assert.match(calls[0].sql, /supervisor_committees/);
  const selected = createOverviewReportScope(connection, { complexId: 3 });
  await selected.query(`SELECT cx.id FROM complexes cx WHERE ${selected.complex('cx.id')}`);
  assert.deepEqual(calls[1].values, [3]);
  assert.doesNotMatch(calls[1].sql, /EXISTS/);
});
