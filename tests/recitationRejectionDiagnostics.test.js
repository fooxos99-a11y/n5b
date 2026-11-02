import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseUnavailableRecitationTask, recordUnavailableRecitationTask, recordRecitationBatchRejection } from '../server/services/recitationRejectionDiagnostics.js';
import { recitationRejectionDetails } from '../src/lib/recitationTaskResults.js';

const requestId = '018f47f0-a321-4a2f-8abc-1234567890ab';
const sessionId = '018f47f0-a321-4a2f-8abc-1234567890ac';
const input = { supervisorId: 7, taskId: 10, sessionDate: '2026-11-01', taskEndDate: '2026-11-01', settings: {} };
const valid = { studentId: 8, planId: 3, taskDate: '2026-11-01', taskType: 'memorization',
  teacherCompleted: null, compensationIndex: 0, contextExists: 1, inTeacherScope: 1,
  attendanceStatus: 'present', studyDateAllowed: 1, uncompensated: 1, hasSuccessfulAttempt: 0, newerTaskId: null };
const connection = row => ({ query: async () => [[row].filter(Boolean)] });

test('unavailable tasks report the actual failed selection checks, including multiple failures', async () => {
  for (const [patch, reason] of [
    [{ attendanceStatus: 'absent' }, 'ATTENDANCE_REQUIRED'],
    [{ attendanceStatus: 'excused' }, 'ATTENDANCE_REQUIRED'],
    [{ taskType: 'repeat' }, 'TASK_TYPE_UNSUPPORTED'],
    [{ contextExists: 0 }, 'TASK_CONTEXT_MISSING'],
    [{ studyDateAllowed: 0 }, 'TASK_DATE_EXCLUDED'],
    [{ uncompensated: 0 }, 'DAY_ALREADY_COMPENSATED'],
    [{ taskDate: '2026-11-02' }, 'TASK_NOT_DUE'],
    [{ teacherCompleted: 1 }, 'TASK_ALREADY_COMPLETED'],
    [{ newerTaskId: 12 }, 'TASK_REPLACED'],
  ]) {
    const result = await diagnoseUnavailableRecitationTask(connection({ ...valid, ...patch }), input);
    assert.equal(result.reason, reason);
    assert.ok(result.failedChecks.includes(reason));
  }
  const result = await diagnoseUnavailableRecitationTask(connection({ ...valid, attendanceStatus: 'absent', newerTaskId: 12 }), input);
  assert.deepEqual(result.failedChecks, ['ATTENDANCE_REQUIRED', 'TASK_REPLACED']);
  assert.equal((await diagnoseUnavailableRecitationTask(connection(null), input)).reason, 'TASK_NOT_FOUND');
});

test('diagnostics respect successful history, compensation replacement and explicit retry selection exceptions', async () => {
  const successful = await diagnoseUnavailableRecitationTask(connection({ ...valid, teacherCompleted: 1, hasSuccessfulAttempt: 1 }), input);
  assert.deepEqual(successful.failedChecks, []);
  const compensation = await diagnoseUnavailableRecitationTask(connection({ ...valid, taskType: 'review', compensationIndex: 1, teacherCompleted: 1 }), { ...input, allowCompletedCompensation: true });
  assert.deepEqual(compensation.failedChecks, []);
  const retry = await diagnoseUnavailableRecitationTask(connection({ ...valid, teacherCompleted: 1, newerTaskId: 12 }), { ...input, explicitRetry: true });
  assert.deepEqual(retry.failedChecks, []);
  assert.equal(retry.reason, 'SELECTION_CHANGED');
});

test('an out-of-scope task reveals no student or plan details', async () => {
  const diagnostic = await diagnoseUnavailableRecitationTask(connection({ ...valid, inTeacherScope: 0 }), input);
  assert.deepEqual(diagnostic, { reason: 'TASK_OUTSIDE_SCOPE', failedChecks: ['TASK_OUTSIDE_SCOPE'] });
});

test('public rejection details do not distinguish foreign tasks from missing tasks', async () => {
  for (const row of [null, { ...valid, inTeacherScope: 0 }]) {
    const result = await recordUnavailableRecitationTask({ ...input, req: { traceId: requestId, body: {} },
      connection: connection(row) }, () => {});
    assert.deepEqual(result, { code: 'RECITATION_TASK_UNAVAILABLE', reason: 'TASK_UNAVAILABLE', requestId });
  }
});

test('recording a rejection emits only diagnostic identifiers and preserves the reason on the response', async () => {
  const records = [];
  const req = { traceId: requestId, body: { sessionId, password: 'secret', wordMarks: [{ private: 'marks' }] } };
  const response = await recordUnavailableRecitationTask({ ...input, connection: connection({ ...valid, newerTaskId: 12 }), req }, row => records.push(row));
  assert.deepEqual(response, { code: 'RECITATION_TASK_UNAVAILABLE', reason: 'TASK_REPLACED', requestId });
  assert.equal(records[0].newerTaskId, 12);
  assert.equal(records[0].sessionId, sessionId);
  assert.equal(records[0].taskId, 10);
  assert.doesNotMatch(JSON.stringify(records), /secret|wordMarks|private|password/);
});

test('diagnostic database failures keep the original rejection and redact SQL and error messages', async () => {
  const records = [];
  const result = await recordUnavailableRecitationTask({ ...input, req: { body: {} },
    connection: { query: async () => { throw Object.assign(new Error('password=secret; SELECT private'), { code: 'ER_DBACCESS_DENIED_ERROR' }); } } }, row => records.push(row));
  assert.equal(result.reason, 'DIAGNOSTICS_UNAVAILABLE');
  assert.match(result.requestId, /^[a-f0-9-]{36}$/);
  assert.equal(records[0].errorCode, 'ER_DBACCESS_DENIED_ERROR');
  assert.doesNotMatch(JSON.stringify(records), /secret|SELECT|private/);
});

test('nested batch rejections remain traceable on the server and in the local session', () => {
  const records = [];
  const failed = { taskId: 10, result: 'conflict', data: { code: 'RECITATION_TASK_UNAVAILABLE', reason: 'ATTENDANCE_REQUIRED', requestId } };
  recordRecitationBatchRejection({ auth: { id: 7 }, traceId: requestId }, { sessionId, studentId: 8 }, failed, row => records.push(row));
  assert.equal(records[0].event, 'recitation_batch_rejected');
  assert.equal(records[0].reason, 'ATTENDANCE_REQUIRED');
  assert.deepEqual(recitationRejectionDetails({ tasks: [{ taskId: 9, result: 'accepted' }, failed] }), {
    taskId: 10, code: 'RECITATION_TASK_UNAVAILABLE', reason: 'ATTENDANCE_REQUIRED', requestId,
  });
  assert.equal(recitationRejectionDetails({ tasks: [{ result: 'accepted' }] }), null);
  recordRecitationBatchRejection({}, {}, null, row => records.push(row));
  assert.equal(records.length, 1);
});
