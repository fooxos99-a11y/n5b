export function canTeacherSetRecitationAttendance(settings, role) {
  return role === 'supervisor' && settings.recitationAttendanceSource === 'teacher';
}

export function isRecitationAttendanceVisible(status, teacherAttendanceMode) {
  return ['present', 'late'].includes(status) || (teacherAttendanceMode && !['absent', 'excused'].includes(status));
}
