import { ATTENDANCE_GRADE_STATUSES } from './grading-policy.js';

/** Old session records contain only the attended boolean. */
export function sessionAttendanceStatus(value = {}) {
  if (!value || value.attendanceRecorded === false) return null;
  if (ATTENDANCE_GRADE_STATUSES.includes(value.attendanceStatus)) return value.attendanceStatus;
  if (value.attended === true) return 'present';
  return value.attended === false ? 'absent' : null;
}

export const canTestSession = value => ['present', 'late'].includes(sessionAttendanceStatus(value));

export function sessionAttendanceGrade(policy, status) {
  if (!ATTENDANCE_GRADE_STATUSES.includes(status)) return 0;
  return status === 'present' ? policy.attendance : policy[`attendance${status[0].toUpperCase()}${status.slice(1)}`];
}
