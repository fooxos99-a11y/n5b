import { ATTENDANCE_GRADE_STATUSES } from './grading-policy.js';

/** Old session records contain only the attended boolean. */
export function sessionAttendanceStatus(value = {}) {
  return ATTENDANCE_GRADE_STATUSES.includes(value.attendanceStatus)
    ? value.attendanceStatus : value.attended === true ? 'present' : 'absent';
}

export const canTestSession = value => ['present', 'late'].includes(sessionAttendanceStatus(value));

export function sessionAttendanceGrade(policy, status) {
  return status === 'present' ? policy.attendance : policy[`attendance${status[0].toUpperCase()}${status.slice(1)}`];
}
