export function studentSessionResult(task) {
  if (task.teacherCompleted == null) return { label: 'بانتظار التقييم', tone: 'pending' };
  const completed = task.teacherCompleted === true || task.teacherCompleted === 1;
  const mistakes = Math.max(0, Number(task.mistakeCount) || 0);
  const warnings = Math.max(0, Number(task.warningCount) || 0);
  const hesitations = Math.max(0, Number(task.hesitationCount) || 0);
  const details = [mistakes && `${mistakes} أخطاء`, warnings && `${warnings} تنبيهات`, hesitations && `${hesitations} ترددات`].filter(Boolean).join('، ');
  const score = task.evaluationScore == null ? '' : `الدرجة ${Number(task.evaluationScore)} من ${Number(task.evaluationMaxScore || 100)}`;
  return { label: [completed ? (details || 'متقن') : ['راسب', details].filter(Boolean).join(' · '), score].filter(Boolean).join(' · '), tone: completed ? (details ? 'mistakes' : 'completed') : 'incomplete' };
}

export function studentSessionGroupResult(tasks) {
  if (tasks.some(task => task.teacherCompleted == null)) return studentSessionResult({});
  return studentSessionResult({
    teacherCompleted: tasks.every(task => task.teacherCompleted === true || task.teacherCompleted === 1),
    mistakeCount: tasks.reduce((sum, task) => sum + Math.max(0, Number(task.mistakeCount) || 0), 0),
    warningCount: tasks.reduce((sum, task) => sum + Math.max(0, Number(task.warningCount) || 0), 0),
    hesitationCount: tasks.reduce((sum, task) => sum + Math.max(0, Number(task.hesitationCount) || 0), 0),
  });
}
