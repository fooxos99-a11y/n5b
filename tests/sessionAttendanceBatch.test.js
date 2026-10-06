import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSessionAttendance, trackAttendancePayload } from '../src/services/sessionAttendanceBatch.js';

test('bulk weekly attendance uses the displayed students and selected week, leaving present and compensated records intact', async () => {
  const writes = [];
  const students = [
    { id: 1, grade: {} },
    { id: 2, grade: { weeklyDetail: { attendanceStatus: 'absent' } } },
    { id: 3, grade: { weeklyDetail: { attendanceStatus: 'present' } } },
    { id: 4, grade: { weeklyDetail: { operationType: 'compensation', attendanceStatus: 'late' } } },
  ];
  const result = await prepareSessionAttendance({ students, component: 'weekly', weekStart: '2026-09-27', save: async row => writes.push(row) });
  assert.deepEqual(result, { saved: 2, failed: 0 });
  assert.deepEqual(writes, [1, 2].map(studentId => ({ studentId, weekStart: '2026-09-27', component: 'weekly', attendanceStatus: 'present' })));
  assert.deepEqual(students[0].grade, {});
});

test('bulk track attendance retains evaluations and leaves untested segments pending', async () => {
  const range = { startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7 };
  const writes = [];
  await prepareSessionAttendance({ component: 'track', weekStart: '2026-09-27', segmentCount: 2, save: async row => writes.push(row), students: [
    { id: 1, grade: {} },
    { id: 2, grade: { trackDetail: { attendanceStatus: 'late', segments: [{ mistakes: 2, warnings: 1, hesitations: 3, range, recorded: true }, { recorded: false }] } } },
  ] });
  assert.deepEqual(writes[0].segments, [{ recorded: false }, { recorded: false }]);
  assert.deepEqual(writes[1].segments[0], { mistakes: 2, warnings: 1, hesitations: 3, range, recorded: true });
  assert.equal(writes[1].segments[1].recorded, false);
  assert.ok(writes.every(row => row.attendanceStatus === 'present' && !row.attemptToken));
});

test('failed and unauthorized attendance writes do not stop subsequent students or mutate their records', async () => {
  const attempted = [];
  let inFlight = 0;
  const students = [1, 2, 3].map(id => ({ id, grade: {} }));
  const result = await prepareSessionAttendance({ students, component: 'weekly', weekStart: '2026-09-27', save: async ({ studentId }) => {
    assert.equal(inFlight++, 0);
    attempted.push(studentId);
    await Promise.resolve();
    inFlight--;
    if (studentId < 3) throw Object.assign(new Error('Forbidden'), { status: 403 });
  } });
  assert.deepEqual(attempted, [1, 2, 3]);
  assert.deepEqual(result, { saved: 1, failed: 2 });
  assert.ok(students.every(student => Object.keys(student.grade).length === 0));
});

test('empty lists cause no writes and absent track attendance discards test payload', async () => {
  assert.deepEqual(await prepareSessionAttendance({ students: [], component: 'weekly', save: () => assert.fail('unexpected write') }), { saved: 0, failed: 0 });
  assert.deepEqual(trackAttendancePayload({ attendanceStatus: 'present', segments: [{ mistakes: 2 }] }, 'absent', 2), { attendanceStatus: 'absent', segments: [] });
});
