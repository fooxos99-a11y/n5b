export function isRecitationActionPending(task) {
  return !task.locallySaved && ![true, 1].includes(task.teacherCompleted);
}

export function shouldShowRecitationStudent(student, tasks = [], taskQueue = []) {
  if (!['present', 'late'].includes(student.attendanceStatus)) return true;
  const remaining = tasks.some((task) => (
    Number(task.studentId) === Number(student.studentId) && isRecitationActionPending(task)
  ));
  if (remaining) return true;
  const saved = student.recitationFinished || student.recitationPending
    || [...tasks, ...taskQueue].some((task) => Number(task.studentId) === Number(student.studentId)
      && !isRecitationActionPending(task));
  return !saved;
}
