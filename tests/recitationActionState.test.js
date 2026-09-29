import { advanceRecitationTaskQueue } from '../src/lib/recitationTaskQueue.js';
import { mergeCommittedOfflineEvaluation } from '../src/lib/offlineEvaluationMerge.js';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRecitationActionPending, shouldShowRecitationStudent } from '../src/lib/recitationActionState.js';

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
