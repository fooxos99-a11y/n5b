import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { attendanceForDay, pendingAttendanceForDay } from '../src/lib/staffAttendanceDay.js';
import { getBusinessDate } from '../shared/business-date.js';

test('present and late attendance hide only for the current operational day ending at 03:00 Riyadh', () => {
  const beforeBoundary = getBusinessDate(new Date('2026-09-06T23:59:59Z'));
  const afterBoundary = getBusinessDate(new Date('2026-09-07T00:00:00Z'));
  for (const status of ['present', 'late', 'pending_sync']) {
    const record = { date: beforeBoundary, enabled: true, alreadyPresent: true, canAttend: false, status, checkInTime: '16:00', pendingSync: true };
    assert.equal(attendanceForDay(record, beforeBoundary).alreadyPresent, true);
    const nextDay = attendanceForDay(record, afterBoundary);
    assert.equal(nextDay.alreadyPresent, false);
    assert.equal(nextDay.canAttend, true);
    assert.equal(nextDay.status, null);
    assert.equal(nextDay.checkInTime, null);
    assert.equal(nextDay.pendingSync, false);
    assert.equal(record.alreadyPresent, true);
  }
  assert.equal(attendanceForDay(null, afterBoundary), null);
  assert.equal(attendanceForDay({ date: beforeBoundary, enabled: false }, afterBoundary).canAttend, false);
});

test('offline reload recognizes only this day pending attendance, not rejected or other actions', () => {
  const date = '2026-09-06';
  const action = { actionType: 'staff_attendance', status: 'pending', dedupeKey: `staff-attendance:${date}` };
  for (const status of ['pending', 'failed', 'syncing']) {
    assert.ok(pendingAttendanceForDay([{ ...action, status }], date));
  }
  for (const status of ['rejected_conflict', 'rejected_permission', 'rejected_validation', 'synced']) {
    assert.equal(pendingAttendanceForDay([{ ...action, status }], date), undefined);
  }
  assert.equal(pendingAttendanceForDay([action], '2026-09-07'), undefined);
  assert.equal(pendingAttendanceForDay([{ ...action, actionType: 'student_attendance' }], date), undefined);
});

test('both teacher entry points share attendance state and filter the completed daily page', async () => {
  for (const file of ['AccountPortal', 'WajehDashboard']) {
    const source = await readFile(new URL(`../src/pages/${file}.jsx`, import.meta.url), 'utf8');
    assert.match(source, /useStaffAttendance\(staffAttendanceActive\)/);
    assert.match(source, /staffAttendanceSource === 'teacher' && !alreadyPresentToday/);
    assert.match(source, /<StaffAttendanceSection attendanceState=\{staffAttendanceState\}/);
    assert.match(source, /<StaffAttendancePrompt[^>]+attendanceState=\{staffAttendanceState\}/);
  }
});
