import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExplicitRecitationRetry, assertRetrySessionIdentity, isRecitationRetryComplete } from '../server/services/recitationRetries.js';
import { normalizeRecitationSession, recitationCandidateWins } from '../shared/offline-recitation.js';
import { advanceRecitationTaskQueue } from '../src/lib/recitationTaskQueue.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';

const previous = '018f47f0-a321-4a2f-8abc-1234567890ab';
const next = '018f47f0-a321-4a2f-8abc-1234567890ac';
const base = () => ({ req: { auth: { role: 'supervisor', id: 7 }, body: { retryOf: previous, planVersion: 2 },
  recitationTransaction: {}, recitationSessionTaskIds: [1, 2] },
slot: { sessionId: previous, status: 'accepted', planId: 3, planVersion: 2 }, task: { planId: 3 }, sessionId: next, currentPlanVersion: 2 });
const parts = { query: async () => [[{ taskId: 1 }, { taskId: 2 }]] };

test('an explicit retry covers exactly the previous accepted amount and permits a newer result', async () => {
  assert.equal(await assertExplicitRecitationRetry(parts, base()), true);
  assert.equal(recitationCandidateWins({ trusted: true, eventAt: '11:00' }, { trusted: true, eventAt: '10:00' }), false);
});

test('incomplete, extended, stale and unauthorized retries cannot replace the accepted result', async () => {
  for (const mutate of [
    input => { input.req.recitationSessionTaskIds = [1]; },
    input => { input.req.recitationSessionTaskIds = [1, 2, 3]; },
    input => { input.req.recitationSessionTaskIds = [1, 3]; },
    input => { input.slot.sessionId = next; },
    input => { input.slot.status = 'pending'; },
    input => { input.slot.planId = 4; },
    input => { input.currentPlanVersion = 3; },
    input => { input.req.body.planVersion = 1; },
    input => { input.req.body.retryOf = 'invalid'; },
    input => { input.req.recitationTransaction = null; },
    input => { input.req.auth.role = 'student'; },
  ]) {
    const input = base(); mutate(input);
    await assert.rejects(assertExplicitRecitationRetry(parts, input), { statusCode: 409 });
  }
});

test('idempotent retry delivery uses the original parent and cannot rewrite another session identity', async () => {
  const input = base();
  input.slot = { sessionId: next, retryOf: previous };
  assert.equal(await assertExplicitRecitationRetry(parts, input), false);
  input.slot.retryOf = next;
  await assert.rejects(assertExplicitRecitationRetry(parts, input), { statusCode: 409 });
  const existing = { query: async () => [[{ studentId: 8, sessionDate: '2026-11-01', sessionType: 'review', retryOf: previous }]] };
  await assertRetrySessionIdentity(existing, { ...base(), task: { studentId: 8 }, sessionDate: '2026-11-01', sessionType: 'review' });
  await assert.rejects(assertRetrySessionIdentity(existing, { ...base(), task: { studentId: 9 }, sessionDate: '2026-11-01', sessionType: 'review' }), { statusCode: 409 });
});

test('grade and plan side effects wait for every new part', async () => {
  assert.equal(await isRecitationRetryComplete({ query: async () => [[{ count: 1 }]] }, base().req, next), false);
  assert.equal(await isRecitationRetryComplete({ query: async () => [[{ count: 2 }]] }, base().req, next), true);
});

test('a durable local result keeps its button visible and pending without replacing the official grade', () => {
  const task = { id: 1, studentId: 8, planId: 3, planVersion: 2, taskType: 'review', teacherCompleted: true, evaluationScore: 90, retryOf: previous };
  const evaluation = { date: '2026-11-01', tasks: [task], taskQueue: [task], students: [{ studentId: 8, attendanceStatus: 'present' }] };
  const session = normalizeRecitationSession({ sessionId: next, retryOf: previous, draftKey: '8:review:retry',
    studentId: 8, sessionDate: evaluation.date, status: 'pending', tasks: [{ taskId: 1, taskType: 'review', planId: 3, planVersion: 2, payload: {} }] });
  assert.equal(session.retryOf, previous); assert.equal(session.draftKey, '8:review:retry');
  for (const state of [advanceRecitationTaskQueue(evaluation, [task], { session }), mergeCommittedOfflineEvaluation(evaluation, [session])]) {
    assert.equal(state.tasks.length, 0);
    assert.equal(state.retryTasks[0].evaluationScore, 90);
    assert.equal(state.retryTasks[0].retryPending, true);
    assert.equal(shouldShowRecitationStudent(state.students[0], state.retryTasks), true);
  }
});

test('an accepted result restores a usable retry from an older offline snapshot, including a failing result', () => {
  for (const teacherCompleted of [true, false]) {
    const task = { id: 1, studentId: 8, planId: 3, planVersion: 2, taskType: 'review', teacherCompleted: null };
    const evaluation = { date: '2026-11-01', tasks: [task], students: [{ studentId: 8, attendanceStatus: 'present' }] };
    const session = { sessionId: next, studentId: 8, sessionDate: evaluation.date, status: 'synced', tasks: [{ taskId: 1, planId: 3, planVersion: 2,
      taskType: 'review', synced: true, result: { ok: true, teacherCompleted, evaluationScore: 70 } }] };
    const result = mergeCommittedOfflineEvaluation(evaluation, [session]);
    assert.equal(result.retryTasks[0].retryOf, next);
    assert.equal(result.retryTasks[0].retryPending, false);
    assert.equal(result.retryTasks[0].teacherCompleted, teacherCompleted);
  }
});
