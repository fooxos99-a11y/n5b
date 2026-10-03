import assert from 'node:assert/strict';
import test from 'node:test';
import { currentSessionWeek, sessionPeriod, assertSessionStarted, recordedSessionDay } from '../shared/session-period.js';
import { buildStudentSessionWeeks } from '../src/lib/studentSessionWeeks.js';
import { studentVisibleSessionGrades } from '../shared/student-amount-visibility.js';

test('each configured session day keeps one storage key for seven days across Sunday', () => {
  for (let day = 0; day < 7; day++) {
    const period = sessionPeriod('2026-09-27', day);
    for (let offset = 0; offset < 7; offset++) {
      const date = new Date(`${period.start}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      assert.equal(currentSessionWeek(date.toISOString().slice(0, 10), day), '2026-09-27');
    }
    const next = new Date(`${period.end}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    assert.equal(currentSessionWeek(next.toISOString().slice(0, 10), day), '2026-10-04');
  }
  assert.deepEqual(sessionPeriod('2026-09-27', 0), { start: '2026-09-27', end: '2026-10-03' });
  assert.deepEqual(sessionPeriod('2026-09-27', 2), { start: '2026-09-29', end: '2026-10-05' });
  assert.equal(currentSessionWeek('2026-10-05', 2), '2026-09-27');
  assert.equal(currentSessionWeek('2026-10-06', 2), '2026-10-04');
});

test('an unstarted session is rejected while every day of its active period permits grading', () => {
  assert.throws(() => assertSessionStarted('2026-09-27', 2, '2026-09-28'), { status: 422 });
  for (const today of ['2026-09-29', '2026-10-03', '2026-10-04', '2026-10-05']) {
    assert.doesNotThrow(() => assertSessionStarted('2026-09-27', 2, today));
  }
});

test('timing changes apply to new sessions while recorded sessions retain their own day', () => {
  assert.equal(recordedSessionDay(3, null, 'trackSession'), 3);
  assert.equal(recordedSessionDay(3, { trackSession: { sessionDay: 2 } }, 'trackSession'), 2);
  assert.equal(recordedSessionDay(6, { weeklySession: { sessionDay: 0 } }, 'weeklySession'), 0);
  assert.equal(recordedSessionDay(6, { weeklySession: { sessionDay: null } }, 'weeklySession'), 0);
});

test('student weeks retain reading-only and session-only history and do not expose future days', () => {
  const reading = { grade: 0, max: 2, passed: false, detail: { requiredFaces: 8, completed: false } };
  const weeks = buildStudentSessionWeeks({ today: '2026-10-03', rows: [], weeklyGrades: [
    { weekStart: '2026-09-27', weekEnd: '2026-10-03', days: [{ date: '2026-09-30', components: { reading: { grade: 0, max: 2 } } }], records: { '2026-09-30': { reading } } },
    { weekStart: '2026-09-20', weekEnd: '2026-09-26', trackDetail: { attendanceStatus: 'absent' }, days: [] },
    { weekStart: '2026-10-04', weekEnd: '2026-10-10', days: [{ date: '2026-10-04', components: { reading: {} } }] },
  ] });
  assert.deepEqual(weeks.map(week => week.start), ['2026-09-27', '2026-09-20']);
  assert.deepEqual(weeks[0].days.find(day => day.date === '2026-09-30').records.reading, reading);
  assert.equal(weeks[1].grade.trackDetail.attendanceStatus, 'absent');
});

test('session history respects each hidden amount without hiding grades or the self reading', () => {
  const grades = [{ records: { '2026-09-30': {
    memorization: { grade: 1, detail: { faces: [{ page: 5 }] } },
    reading: { grade: 2, detail: { requiredFaces: 8 } },
  } }, trackDetail: { segments: [{ source: 'link', range: { fromSurah: 2, fromAyah: 25 } }, { source: 'review', range: { fromSurah: 3, fromAyah: 1 } }] } }];
  const settings = { hideStudentAmounts: true, hideStudentReviewAmount: false };
  const [hidden] = studentVisibleSessionGrades(grades, settings, 'student');
  assert.equal(hidden.records['2026-09-30'].memorization.grade, 1);
  assert.equal(hidden.records['2026-09-30'].memorization.detail, null);
  assert.equal(hidden.records['2026-09-30'].reading.detail.requiredFaces, 8);
  assert.equal(hidden.trackDetail.segments[0].range, null);
  assert.equal(hidden.trackDetail.segments[1].range.fromSurah, 3);
  assert.equal(grades[0].trackDetail.segments[0].range.fromSurah, 2);
  assert.equal(studentVisibleSessionGrades(grades, settings, 'supervisor'), grades);
});
