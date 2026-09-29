export function isStudentPlanDayComplete(tasks = [], { repeatCount = 0, listeningCount = 0, executionSources = {} } = {}) {
  if (!tasks.length) return false;
  return tasks.every((task) => {
    if (task.teacherCompleted === false || task.teacherCompleted === 0) return false;
    const approved = task.teacherCompleted === true || task.teacherCompleted === 1;
    const source = executionSources[task.taskType];
    const studentExecutionAllowed = source !== 'teacher' && task.executionActorRole !== 'teacher';
    if (!approved && !(studentExecutionAllowed && task.studentStatus === 'done' && ['complete', 'extra'].includes(task.executionState))) return false;
    if (task.taskType !== 'repeat') return true;
    return Number(task.actualRepeatCount || 0) >= Number(repeatCount || 0)
      && Number(task.actualListeningCount || 0) >= Number(listeningCount || 0);
  });
}
