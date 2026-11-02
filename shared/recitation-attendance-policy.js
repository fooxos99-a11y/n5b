export function canTeacherSetRecitationAttendance(settings, role) {
  return role === 'supervisor' && settings.recitationAttendanceSource === 'teacher';
}

export function isRecitationAttendanceVisible(status, teacherAttendanceMode) {
  return Boolean(teacherAttendanceMode) || ['present', 'late'].includes(status);
}
