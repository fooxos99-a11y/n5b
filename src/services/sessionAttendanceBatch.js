import { canTestSession, sessionAttendanceStatus } from '../../shared/session-attendance.js';

export function trackAttendancePayload(detail, attendanceStatus, segmentCount) {
  const attended = canTestSession({ attendanceStatus });
  const tested = detail && canTestSession(detail) && detail.segments?.some(segment => segment.recorded !== false);
  const segments = attended && tested
    ? detail.segments.map(({ mistakes, warnings, hesitations = 0, range, recorded }) => ({ mistakes, warnings, hesitations, range, recorded: recorded !== false }))
    : Array.from({ length: attended ? segmentCount : 0 }, () => ({ recorded: false }));
  return { attendanceStatus, segments };
}

export function studentsToPrepare(students, component) {
  return students.filter(student => {
    const detail = student.grade?.[`${component}Detail`];
    return detail?.operationType !== 'compensation' && sessionAttendanceStatus(detail) !== 'present';
  });
}

export async function prepareSessionAttendance({ students, component, weekStart, segmentCount = 0, save }) {
  const result = { saved: 0, failed: 0 };
  // Serialize grade/point transactions and continue after individual failures.
  await studentsToPrepare(students, component).reduce((previous, student) => previous.then(async () => {
    const payload = component === 'track'
      ? trackAttendancePayload(student.grade?.trackDetail, 'present', segmentCount)
      : { attendanceStatus: 'present' };
    try {
      await save({ studentId: student.id, weekStart, component, ...payload });
      result.saved += 1;
    } catch {
      result.failed += 1;
    }
  }), Promise.resolve());
  return result;
}
