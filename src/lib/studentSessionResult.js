import { formatPointsNumber } from './pointsFormat.js';

export function studentSessionResult(task, gradeRecord = task.programGrade) {
  if (task.teacherCompleted == null) return { label: 'بانتظار التقييم', tone: 'pending' };
  const completed = task.teacherCompleted === true || task.teacherCompleted === 1;
  const mistakes = Math.max(0, Number(task.mistakeCount) || 0);
  const warnings = Math.max(0, Number(task.warningCount) || 0);
  const hesitations = Math.max(0, Number(task.hesitationCount) || 0);
  const details = [mistakes && `${mistakes} أخطاء`, warnings && `${warnings} تنبيهات`, hesitations && `${hesitations} ترددات`].filter(Boolean).join('، ');
  const score = gradeRecord && Number.isFinite(Number(gradeRecord.grade)) && Number.isFinite(Number(gradeRecord.max))
    ? `الدرجة ${formatPointsNumber(gradeRecord.grade)} من ${formatPointsNumber(gradeRecord.max)}` : '';
  return { label: [completed ? (details || (!score ? 'تم التسميع' : '')) : ['راسب', details].filter(Boolean).join(' · '), score].filter(Boolean).join(' · '), tone: completed ? (details ? 'mistakes' : 'completed') : 'incomplete' };
}

export function studentSessionGroupResult(tasks, gradeRecord = tasks[0]?.programGrade) {
  if (!tasks.length || tasks.some(task => task.teacherCompleted == null)) return studentSessionResult({});
  return studentSessionResult({
    teacherCompleted: tasks.every(task => task.teacherCompleted === true || task.teacherCompleted === 1),
    mistakeCount: tasks.reduce((sum, task) => sum + Math.max(0, Number(task.mistakeCount) || 0), 0),
    warningCount: tasks.reduce((sum, task) => sum + Math.max(0, Number(task.warningCount) || 0), 0),
    hesitationCount: tasks.reduce((sum, task) => sum + Math.max(0, Number(task.hesitationCount) || 0), 0),
  }, gradeRecord);
}

/** A daily component has one grade, even when its Quran amount spans several rows. */
export function groupSessionTasksByGradeDate(tasks) {
  const groups = new Map();
  for (const task of tasks) {
    const key = task.taskDate || task.sessionDate || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  return [...groups.values()];
}

export function studentSessionMarks(task) {
  const marks = task.wordMarks?.length ? task.wordMarks : Array.isArray(task.ayahMarks) ? task.ayahMarks : [];
  return marks.flatMap(mark => mark.markType ? [mark] : [
    ['mistake', mark.mistakeCount], ['warning', mark.warningCount], ['hesitation', mark.hesitationCount],
  ].filter(([, count]) => Number(count) > 0).map(([markType, count]) => ({ ...mark, markType, count: Number(count) })));
}
