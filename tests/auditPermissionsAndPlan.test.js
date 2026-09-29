import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAdministratorScope } from '../server/services/administratorScope.js';
import { updateContinuedQuranPlan } from '../server/services/continuedQuranPlan.js';
import { evaluateReview, computeWeeklyGrade } from '../shared/grading-engine.js';

const accountPermissions = new Map([[1, ['administrators']], [2, ['administrators', 'settings']], [3, []]]);
const connection = { query: async (_sql, [id]) => [(accountPermissions.get(Number(id)) || []).map(permissionKey => ({ permissionKey }))] };

test('delegated administrator cannot escalate itself, create an elevated account or take over/delete a stronger account', async () => {
  const actor = { role: 'admin', id: 1 };
  for (const request of [{ targetId: 1, permissions: ['administrators', 'settings'] }, { permissions: ['settings'] }, { targetId: 2 }, { targetId: 2, permissions: [] }]) {
    await assert.rejects(assertAdministratorScope(connection, actor, request), error => error.status === 403);
  }
  await assertAdministratorScope(connection, actor, { targetId: 3, permissions: ['administrators'] });
  await assertAdministratorScope(connection, { role: 'manager' }, { targetId: 2, permissions: ['settings'] });
});

test('continuing a plan retains its id, accepted tasks, prior memorization and review cursor', async () => {
  const calls = [];
  await updateContinuedQuranPlan({ query: async (sql, params) => { calls.push({ sql, params }); } }, {
    plan: { id: 17, studentId: 3 }, effectiveFrom: '2026-09-29', scheduleDays: [0, 1, 2, 3, 4],
    scheduleAnchor: { page: 590, surah: 85, ayah: 22 },
    values: { startDate: '2026-09-01', start: { page: 604, surah: 114, ayah: 1 }, end: { page: 582, surah: 78, ayah: 40 },
      track: 'memorization', dailyPages: 2, linkPages: 10, reviewPages: 20, reviewHizbs: 2, readingFaces: 10,
      reviewSplitWeekly: 0, reviewWeekStartDay: 0, reviewWeekEndDay: 6, reviewMinDailyPages: 1 },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /UPDATE student_quran_plans/);
  assert.doesNotMatch(calls.map(call => call.sql).join(' '), /INSERT|paused|prior_memorization|next_review_page/);
  assert.deepEqual(calls[0].params.slice(-2), [17, 3]);
  assert.deepEqual(calls[1].params, [17, '2026-09-29']);
  assert.match(calls[1].sql, /teacher_completed IS NULL/);
  assert.match(calls[1].sql, /is_official = 1/);
});

test('zero-score long reviews fail and attendance never exceeds the configured maximum', () => {
  assert.equal(evaluateReview({}, { hizbs: Array.from({ length: 10 }, () => ({ mistakes: 2 })) }).passed, false);
  const week = computeWeeklyGrade({}, { today: '2026-09-28', days: [{ date: '2026-09-27', weekday: 0, attendance: { grade: 3 } }] });
  assert.equal(week.parts.attendance, 1);
});
