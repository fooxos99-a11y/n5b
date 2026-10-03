import test from 'node:test';
import assert from 'node:assert/strict';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';
import { narrationCommitteeIds } from '../shared/narration-committee-scope.js';

test('complex, circle and teacher constraints bind in query order and intersect', async () => {
  const calls = [];
  const scope = createOverviewReportScope({ query: async (sql, values) => { calls.push({ sql, values }); return [[]]; } }, { auth: { role: 'supervisor', id: 7 }, committeeId: 20, complexId: 2 });
  await scope.query(`SELECT * FROM students s WHERE s.id > ? AND ${scope.student('s.id')} AND s.id < ?`, [0, 99]);
  assert.deepEqual(calls[0].values, [0, 7, 20, 2, 99]);
  assert.match(calls[0].sql, /supervisor_committees/);
  assert.match(calls[0].sql, /complex_id = \?/);
  assert.doesNotMatch(calls[0].sql, /:overview/);
  for (const complexId of ['1 OR 1=1', 0, -1, 1.5, 'bad', '']) assert.throws(() => createOverviewReportScope({}, { complexId }), { status: 422 });
});

test('a complex scopes every student and assigned member of staff, and all retains the original scope', async () => {
  const calls = [];
  const scope = createOverviewReportScope({ query: async (sql,values) => { calls.push({sql,values}); return [[]]; } }, { complexId: 4 });
  await scope.query(`SELECT COUNT(*) FROM supervisors WHERE ${scope.staff('supervisors.id')} AND ? = ?`,[1,1]);
  assert.deepEqual(calls[0].values,[4,1,1]);
  assert.match(calls[0].sql,/overview_staff.supervisor_id = supervisors.id/);
  assert.match(scope.student('s.id'), /overview_student/);
  assert.equal(createOverviewReportScope({},{}).student('s.id'),'1=1');
  assert.equal(createOverviewReportScope({},{}).staff('supervisors.id'),'1=1');
});

test('narration all within one complex resolves to explicit circles without widening the event', () => {
  const circles = [{id:1,complexId:5},{id:2,complexId:5},{id:3,complexId:6},{id:4,complexId:null}];
  assert.deepEqual(narrationCommitteeIds({committeeIds:['all']},circles),['all']);
  assert.deepEqual(narrationCommitteeIds({complexId:'5',committeeIds:['all']},circles),['1','2']);
  assert.deepEqual(narrationCommitteeIds({complexId:'5',committeeIds:['1','3','1']},circles),['1']);
  assert.deepEqual(narrationCommitteeIds({complexId:'99',committeeIds:['all']},circles),[]);
  assert.deepEqual(narrationCommitteeIds({committeeIds:['4']},circles),['4']);
});
