import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateTrackSession, evaluateWeeklySession } from '../shared/grading-engine.js';
import { gradingMaxima, gradingPolicyErrors, normalizeGradingPolicy } from '../shared/grading-policy.js';
import { canTestSession, sessionAttendanceStatus } from '../shared/session-attendance.js';

test('session status retains legacy attendance and permits late students to test', () => {
  assert.equal(sessionAttendanceStatus({ attended: true }), 'present');
  assert.equal(sessionAttendanceStatus({ attended: false }), 'absent');
  for (const attendanceStatus of ['present', 'late', 'excused', 'absent']) {
    assert.equal(canTestSession({ attendanceStatus }), ['present', 'late'].includes(attendanceStatus));
  }
});

test('each session awards its configured attendance grade and keeps the present maximum', () => {
  const policy = normalizeGradingPolicy({ trackSession: { attendance: 10, attendanceLate: 6, attendanceExcused: 2, attendanceAbsent: 1 },
    weeklySession: { attendance: 20, attendanceLate: 12, attendanceExcused: 4, attendanceAbsent: 0 } });
  for (const [attendanceStatus, trackGrade, weeklyGrade] of [['present', 10, 20], ['late', 6, 12], ['excused', 2, 4], ['absent', 1, 0]]) {
    const tested = canTestSession({ attendanceStatus });
    const track = evaluateTrackSession(policy, { attendanceStatus, attended: !tested, segments: [{ recorded: true }, { recorded: true }] });
    assert.equal(track.attendanceStatus, attendanceStatus);
    assert.equal(track.attended, tested);
    assert.equal(track.attendanceGrade, trackGrade);
    assert.equal(track.grade, trackGrade + (tested ? 20 : 0));
    assert.equal(track.max, 30);
    assert.ok(track.segments.every(segment => segment.recorded === tested));
    const weekly = evaluateWeeklySession(policy, { attendanceStatus });
    assert.equal(weekly.grade, weeklyGrade); assert.equal(weekly.max, 20);
  }
  assert.equal(gradingMaxima(policy).total, 100);
  assert.equal(evaluateTrackSession(policy, { attendanceStatus: 'late', segments: [{ recorded: false }, { recorded: false }] }).grade, 6);
});

test('new grade settings normalize old policies and reject invalid values or grades above present', () => {
  const policy = normalizeGradingPolicy({ trackSession: { attendance: 8 }, weeklySession: { attendance: 12 } });
  assert.equal(policy.trackSession.attendanceLate, 4); assert.equal(policy.trackSession.attendanceExcused, 2);
  assert.equal(policy.weeklySession.attendanceLate, 6); assert.equal(policy.weeklySession.attendanceExcused, 3);
  for (const section of ['trackSession', 'weeklySession']) {
    for (const key of ['attendanceLate', 'attendanceExcused', 'attendanceAbsent']) {
      for (const value of [-1, '', null, 'bad', 1001, 30]) assert.ok(gradingPolicyErrors({ [section]: { [key]: value } })[`${section}.${key}`]);
    }
  }
});
