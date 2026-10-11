import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewCompensationState, isReviewAmountComplete, canRetryReviewCompensation } from '../server/services/quranReviewCompensations.js';
import { getBusinessDate } from '../shared/business-date.js';
import { up, down } from '../server/migrations/2026.10.11.1-review-compensation-date.js';

const date = '2026-10-10', dueDates = ['2026-10-07', '2026-10-08', '2026-10-09'];
const row = (taskDate, changes = {}) => ({ id: 1, taskDate, compensationIndex: 0, compensationDays: 0,
  fromPage: 2, toPage: 3, fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 20,
  teacherCompleted: null, studentStatus: 'not_done', ...changes });
const history = dueDates.map(day => row(day));
const today = row(date, { teacherCompleted: 1 });
const state = rows => reviewCompensationState(rows, { date, dueDates });

test('review compensation requires teacher acceptance of every whole regular amount today', () => {
  for (const changes of [{ teacherCompleted: null, studentStatus: 'done' }, { teacherCompleted: 0 },
    { executionState: 'partial' }, { actualToSurah: 2, actualToAyah: 19 }]) {
    assert.match(state([...history, { ...today, ...changes }]).blocked, /مراجعة اليوم كاملة/);
  }
  assert.match(state(history).blocked, /لا توجد مراجعة/);
  assert.match(state([...history, today, row(date)]).blocked, /مراجعة اليوم كاملة/);
  assert.equal(state([...history, today]).blocked, null);
});

test('each complete compensation credits only its exact oldest date, with partial groups resumable', () => {
  const pending = row(date, { id: 10, compensationIndex: 1, compensatedReviewDate: dueDates[0], teacherCompleted: 1 });
  const second = { ...pending, id: 11, teacherCompleted: 0 };
  let result = state([...history, today, pending, second]);
  assert.equal(result.owed, 3); assert.equal(result.done, 0);
  assert.deepEqual(result.pending.rows.map(item => item.id), [10, 11]);
  result = state([...history, today, pending, { ...second, teacherCompleted: 1 }]);
  assert.equal(result.owed, 2); assert.equal(result.done, 1); assert.equal(result.pending, null);
  assert.equal(result.sourceDate, dueDates[1]); assert.equal(result.nextIndex, 2);
});

test('a failed or partial compensation does not consume a missed day', () => {
  for (const changes of [{ teacherCompleted: 0 }, { teacherCompleted: 1, executionState: 'partial' },
    { teacherCompleted: 1, actualToSurah: 2, actualToAyah: 19 }]) {
    const pending = row(date, { compensationIndex: 1, compensatedReviewDate: dueDates[0], ...changes });
    const result = state([...history, today, pending]);
    assert.equal(result.owed, 3); assert.ok(result.pending);
  }
});

test('explicit compensation credit cannot shift to another date after an old regular review is accepted', () => {
  const compensation = row(date, { compensationIndex: 1, compensatedReviewDate: dueDates[0], teacherCompleted: 1 });
  const rows = [{ ...history[0], teacherCompleted: 1 }, ...history.slice(1), today, compensation];
  assert.equal(state(rows).owed, 2);
  assert.equal(state(rows).sourceDate, dueDates[1]);
});

test('legacy merged review credits remain valid, counted once per fully approved group', () => {
  const merged = { ...today, compensationDays: 2 };
  assert.equal(state([...history, merged, { ...merged, id: 2 }]).owed, 1);
  assert.equal(state([...history, merged]).done, 2);
  assert.equal(state([...history, merged, { ...merged, id: 2, teacherCompleted: 0 }]).owed, 3);
  const legacyCompensation = row(date, { compensationIndex: 1, teacherCompleted: 1 });
  assert.equal(state([...history, merged, legacyCompensation]).owed, 0);
});

test('excluded dates never become compensation debts and next-day work keeps the source ranges', () => {
  const yesterday = row('2026-10-09', { compensationIndex: 1, compensatedReviewDate: dueDates[0], teacherCompleted: 0 });
  const result = reviewCompensationState([...history, today, yesterday], { date, dueDates: [dueDates[0], dueDates[2]] });
  assert.equal(result.owed, 2); assert.equal(result.sourceDate, dueDates[0]);
  assert.equal(result.ranges[0].taskDate, dueDates[0]); assert.equal(result.pending, null);
  assert.equal(result.nextIndex, 1);
});

test('a completed wrapped review path is accepted without comparing its final verse to the unwrapped bounds', () => {
  assert.equal(isReviewAmountComplete({ ...today, executionState: 'complete', reviewExecution: { ranges: [] }, actualToSurah: 1, actualToAyah: 7 }, true), true);
});

test('the new date migration is repeatable and refuses rollback that would discard compensation attribution', async () => {
  let exists = false; const statements = [];
  const connection = { query: async sql => {
    statements.push(sql);
    if (sql.includes('information_schema')) return [exists ? [{ column_name: 'compensated_review_date' }] : []];
    if (sql.startsWith('ALTER')) exists = true;
    return [[]];
  } };
  await up(connection); await up(connection);
  assert.equal(statements.filter(sql => sql.startsWith('ALTER')).length, 1);
  await assert.rejects(down({ query: async () => [[{ id: 1 }]] }), /recorded compensation tasks/);
});

test('only the same teacher can retry the complete failed compensation group atomically', async () => {
  const options = { req:{ auth:{ role:'supervisor', id:7 }, recitationTransaction:{}, recitationSessionTaskIds:[10,11] },
    slot:{ evaluatorRole:'supervisor', evaluatorId:7, planId:3, planVersion:1 },
    task:{ taskType:'review', compensationIndex:1, planId:3 }, sessionDate:getBusinessDate(), currentPlanVersion:1 };
  const rows = [row(options.sessionDate, { id:10, teacherCompleted:0 }), row(options.sessionDate, { id:11, teacherCompleted:1 })];
  const connection = { query:async () => [rows] };
  assert.equal(await canRetryReviewCompensation(connection, options), true);
  for (const changes of [{ req:{ ...options.req, recitationTransaction:null } },
    { req:{ ...options.req, recitationSessionTaskIds:[10] } }, { slot:{ ...options.slot, evaluatorId:8 } },
    { currentPlanVersion:2 }, { task:{ ...options.task, compensationIndex:0 } },
    { task:{ ...options.task, taskType:'memorization' } }, { sessionDate:'2020-01-01' }]) {
    assert.equal(await canRetryReviewCompensation(connection, { ...options, ...changes }), false);
  }
  rows[0].teacherCompleted = 1;
  assert.equal(await canRetryReviewCompensation(connection, options), false, 'successful compensation cannot be retried');
});
