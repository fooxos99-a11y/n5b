import { shiftDateOnly } from '../../shared/business-date.js';
import { isStudentPlanDayComplete } from '../../shared/student-plan-completion.js';

export async function nameStudentPreviewTasks(connection, tasks) {
  const ids = [...new Set(tasks.flatMap(task => [Number(task.fromSurah), Number(task.toSurah)]).filter(id => Number.isInteger(id) && id >= 1 && id <= 114))];
  if (!ids.length) return tasks;
  const [surahs] = await connection.query('SELECT surah_number AS id, name_arabic AS name FROM quran_surahs WHERE surah_number IN (?)', [ids]);
  const names = new Map(surahs.map(surah => [Number(surah.id), surah.name]));
  return tasks.map(task => ({ ...task, fromSurahName: names.get(Number(task.fromSurah)) || task.fromSurahName, toSurahName: names.get(Number(task.toSurah)) || task.toSurahName }));
}

export async function getStudentNextDayPreview({ date, tasks, repeatCount, listeningCount, executionSources }, loadAmounts) {
  if (!isStudentPlanDayComplete(tasks, { repeatCount, listeningCount, executionSources })) return null;
  const tomorrow = shiftDateOnly(date, 1);
  const amounts = await loadAmounts(tomorrow);
  return amounts.length ? { date: tomorrow, tasks: amounts } : null;
}
