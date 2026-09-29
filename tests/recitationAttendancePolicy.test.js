import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canTeacherSetRecitationAttendance, isRecitationAttendanceVisible } from '../shared/recitation-attendance-policy.js';

test('supervisor attendance only exposes present or late students to recitation accounts', () => {
  for (const role of ['supervisor', 'reciter', 'student']) {
    const editable = canTeacherSetRecitationAttendance({ recitationAttendanceSource: 'supervisor' }, role);
    assert.equal(editable, false);
    for (const status of ['', undefined, 'absent', 'excused']) assert.equal(isRecitationAttendanceVisible(status, editable), false);
    for (const status of ['present', 'late']) assert.equal(isRecitationAttendanceVisible(status, editable), true);
  }
});

test('teacher attendance permits unmarked pupils only for the authorized teacher', () => {
  assert.equal(canTeacherSetRecitationAttendance({ recitationAttendanceSource: 'teacher' }, 'supervisor'), true);
  assert.equal(canTeacherSetRecitationAttendance({ recitationAttendanceSource: 'teacher' }, 'reciter'), false);
  assert.equal(canTeacherSetRecitationAttendance({}, 'supervisor'), false);
  assert.equal(isRecitationAttendanceVisible('', true), true);
  assert.equal(isRecitationAttendanceVisible('absent', true), false);
});

test('API writes and task lists enforce the same attendance policy, including cached UI data', () => {
  const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(server, /req.body.mode === 'recitation_teacher'\s*&& canTeacherSetRecitationAttendance\(settings, req.auth\?\.role\)/);
  assert.match(server, /tasks: rows\s*\.filter\(\(row\) => isRecitationAttendanceVisible/);
  assert.match(server, /taskQueue: rows\s*\.filter\(\(row\) => isRecitationAttendanceVisible/);
  const list = readFileSync(new URL('../src/components/portal/TeacherRecitationTaskList.jsx', import.meta.url), 'utf8');
  assert.match(list, /isRecitationAttendanceVisible\(student.attendanceStatus, recitationAttendanceSource === 'teacher' && student.canSetAttendance\)/);
  assert.match(list, /attendanceEditable = Boolean\(onAttendanceChange\) && recitationAttendanceSource === 'teacher' && student.canSetAttendance/);
});
