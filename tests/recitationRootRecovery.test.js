import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { recitationSessionTypeForTask } from '../shared/offline-recitation.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { recitationErrorMessage } from '../src/lib/recitationErrorMessage.js';
import { evaluateMemorization } from '../shared/grading-engine.js';
import { DEFAULT_GRADING_POLICY } from '../shared/grading-policy.js';
import { getBusinessDate } from '../shared/business-date.js';

const base = { id: 1, studentId: 9, planId: 10, planVersion: 2, taskDate: '2026-09-07', taskType: 'memorization', track: 'memorization' };
const evaluation = () => ({ date: getBusinessDate(), attendanceSnapshotAt: 100, tasks: [base], taskQueue: [base],
  students: [{ studentId: 9, attendanceStatus: 'present' }] });

test('memorization and mastery remain independent recitation sessions', () => {
  assert.notEqual(recitationSessionTypeForTask(base), recitationSessionTypeForTask({ ...base, track: 'mastery' }));
  assert.match(recitationSessionTypeForTask({ ...base, taskType: 'review', track: 'mastery' }), /^review/);
});

test('lost server reply retains the exact saved task while allowing a different next task', () => {
  const session = { sessionId: 'saved', studentId: 9, sessionDate: getBusinessDate(), status: 'failed',
    tasks: [{ ...base, taskId: base.id, synced: false, payload: { offlineOutcome: { completed: true } } }] };
  const state = mergeCommittedOfflineEvaluation(evaluation(), [session]);
  assert.equal(state.tasks.length, 0);
  assert.equal(state.students[0].recitationPending, true);
  assert.equal(state.deliveryReceipts[0].status, 'local_failed');
  const next = { ...base, id: 2, taskDate: '2026-09-08' };
  assert.deepEqual(mergeCommittedOfflineEvaluation({ ...evaluation(), tasks: [next], taskQueue: [next] }, [session]).tasks, [next]);
});

test('manual absence cannot be undone by a response captured before its server receipt', () => {
  const action = { actionType: 'student_attendance', status: 'synced', result: { serverRecordedAt: 200 },
    payload: { studentId: 9, date: getBusinessDate(), status: 'absent' } };
  const absent = mergeCommittedOfflineEvaluation(evaluation(), [], [action]);
  assert.equal(absent.students.length, 0);
  assert.equal(absent.tasks.length, 0);
  assert.equal(absent.taskQueue.length, 0);
  const fresh = { ...evaluation(), attendanceSnapshotAt: 300 };
  assert.equal(mergeCommittedOfflineEvaluation(fresh, [], [action]).students[0].attendanceStatus, 'present');
});

test('service worker leaves API requests to the browser and technical network errors are translated', () => {
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const listeners = {};
  vm.runInNewContext(source, { URL, self: { location: new URL('https://test.local/sw.js'), registration: { scope: 'https://test.local/' },
    addEventListener: (name, handler) => { listeners[name] = handler; } } });
  let intercepted = false;
  listeners.fetch({ request: { url: 'https://test.local/api/recitations', method: 'POST' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
  assert.doesNotMatch(recitationErrorMessage(new Error('FetchEvent.respondWith received an error: TypeError: Load failed')), /FetchEvent|TypeError/);
});


test('mastery errors reduce the local grade', () => {
  const face = evaluateMemorization(DEFAULT_GRADING_POLICY, { faces: [{ mistakes: 2, warnings: 1 }] }).faces[0];
  assert.equal(Math.round(face.score * 10000) / 100, 89);
  assert.equal(face.failed, true);
});
