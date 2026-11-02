import { advanceRecitationTaskQueue } from '../src/lib/recitationTaskQueue.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { canRecordStudentReading, isRecitationActionPending, shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';

test('reading-only days do not require a nonexistent session attendance, but absent and unauthorized entries stay blocked', () => {
  const reading = { studentId: 8, status: null };
  assert.equal(canRecordStudentReading({ readingOnly: true, attendanceStatus: '' }, reading), true);
  for (const attendanceStatus of ['present', 'late']) assert.equal(canRecordStudentReading({ attendanceStatus }, reading), true);
  for (const attendanceStatus of ['absent', 'excused', '']) {
    assert.equal(canRecordStudentReading({ attendanceStatus }, reading), false);
  }
  for (const attendanceStatus of ['absent', 'excused']) {
    assert.equal(canRecordStudentReading({ readingOnly: true, attendanceStatus }, reading), false);
  }
  assert.equal(canRecordStudentReading({ readingOnly: true }, null), false);
});

test('only unevaluated or failed tasks stay actionable', () => {
  assert.equal(isRecitationActionPending({ teacherCompleted: false }), true);
  assert.equal(isRecitationActionPending({ teacherCompleted: null }), true);
  for (const teacherCompleted of [true, 1]) {
    assert.equal(isRecitationActionPending({ teacherCompleted }), false);
  }
  assert.equal(isRecitationActionPending({ locallySaved: true }), false);
});

const student = { studentId: 8, attendanceStatus: 'present', recitationPending: true };
const task = { id: 1, studentId: 8, planId: 17, taskType: 'memorization', track: 'memorization', taskDate: '2026-09-06' };
test('marking attendance retains a student whose amount is still missing', () => {
  const evaluation = { date: '2026-09-08', tasks: [], students: [{ studentId: 13, attendanceStatus: '' }] };
  const result = mergeCommittedOfflineEvaluation(evaluation, [], [{ status: 'pending', actionType: 'student_attendance', payload: { date: evaluation.date, studentId: 13, status: 'present' } }]);
  assert.equal(result.students.length, 1);
  assert.equal(result.students[0].attendanceStatus, 'present');
  assert.equal(shouldShowRecitationStudent(result.students[0]), true);
});
test('hide a saved student during sync and after acknowledgement, but keep unfinished attendance and tasks', () => {
  assert.equal(shouldShowRecitationStudent(student), false);
  assert.equal(shouldShowRecitationStudent({ ...student, recitationPending: false, recitationFinished: true }), false);
  assert.equal(shouldShowRecitationStudent({ ...student, attendanceStatus: '' }), true);
  assert.equal(shouldShowRecitationStudent(student, [task]), true);
  assert.equal(shouldShowRecitationStudent(student, [], [{ ...task, locallySaved: true }]), false);
});

test('local save and offline rehydration remove the submitted task', () => {
  const later = { ...task, id: 2, taskDate: '2026-09-07' };
  const evaluation = { date: '2026-09-07', tasks: [task], taskQueue: [task, later], students: [student] };
  const local = advanceRecitationTaskQueue(evaluation, [task], { promote: false });
  const hydrated = mergeCommittedOfflineEvaluation(evaluation, [{ status: 'pending', studentId: 8, sessionDate: evaluation.date, tasks: [{ taskId: 1 }] }]);
  for (const state of [local, hydrated]) {
    assert.equal(state.tasks.some((row) => row.id === task.id), false);
    assert.equal(shouldShowRecitationStudent(state.students[0], state.tasks, state.taskQueue), false);
  }
});
test('negative-result button requires confirmation before changing progress', () => {
  const source = readFileSync(new URL('../src/components/portal/TeacherEvaluationDialog.jsx', import.meta.url), 'utf8');
  assert.match(source, /onClick=\{\(\) => setConfirmFailure\(true\)\}/);
  assert.match(source, /setConfirmFailure\(false\); void markNotMemorized\(selectedStudent\)/);
});

test('attendance remains editable after completion and repeated absent/excused/present changes preserve tasks and receipts', () => {
  const date = '2026-11-01';
  const acceptedTask = { ...task, teacherCompleted: true, evaluationScore: 97 };
  const receipt = { taskId: task.id, studentId: 8, status: 'server_saved' };
  let state = { date, tasks: [acceptedTask], taskQueue: [acceptedTask], deliveryReceipts: [receipt],
    students: [{ studentId: 8, canSetAttendance: true, attendanceStatus: 'present', recitationFinished: true }] };
  const actions = [];
  for (const status of ['absent', 'present', 'excused', 'present', 'absent', 'late']) {
    actions.push({ status: 'pending', actionType: 'student_attendance', payload: { studentId: 8, date, status } });
    state = mergeCommittedOfflineEvaluation(state, [], actions);
    assert.equal(state.students.length, 1);
    assert.equal(state.students[0].attendanceStatus, status);
    assert.equal(shouldShowRecitationStudent(state.students[0], state.tasks, state.taskQueue), true);
    assert.deepEqual(state.tasks, [acceptedTask]);
    assert.deepEqual(state.taskQueue, [acceptedTask]);
    assert.deepEqual(state.deliveryReceipts, [receipt]);
    assert.equal(canRecordStudentReading(state.students[0], { status: null }), ['present', 'late'].includes(status));
  }
});

test('absence still hides cached work from accounts that cannot change attendance', () => {
  const state = mergeCommittedOfflineEvaluation({ date: '2026-11-01', tasks: [task], taskQueue: [task],
    students: [{ studentId: 8, canSetAttendance: false, attendanceStatus: 'absent' }] });
  assert.equal(state.students.length, 0);
  assert.equal(state.tasks.length, 0);
  assert.equal(state.taskQueue.length, 0);
});
