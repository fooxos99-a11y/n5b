import { buildBranchPassingParts } from './passingEligibility.js';
import { readQuranRange } from './quranReferenceCache.js';
import { currentQuranPlanSql } from './currentQuranPlan.js';

/** Students count once; any completed branch attempt counts regardless of its grade. */
export function branchPassingOverview(ayahs, tasks, attempts, { from, to }) {
  const byStudent = new Map();
  for (const task of tasks) {
    const key = String(task.studentId);
    if (!byStudent.has(key)) byStudent.set(key, { id:Number(task.studentId), name:task.studentName, committeeName:task.committeeName, tasks:[] });
    byStudent.get(key).tasks.push(task);
  }
  const students = [];
  for (const student of byStudent.values()) {
    const parts = buildBranchPassingParts(ayahs, student.tasks);
    if (!parts.length) continue;
    const eligible = new Set(parts.map(part => part.juzNumber));
    const history = attempts.filter(attempt => String(attempt.studentId) === String(student.id) && eligible.has(Number(attempt.juzNumber)) && attempt.date <= to);
    const tested = history.some(attempt => attempt.date >= from);
    const previouslyTested = new Set(history.filter(attempt => attempt.date < from).map(attempt => Number(attempt.juzNumber)));
    // Already tested parts do not create a new monthly obligation.
    const due = parts.filter(part => !previouslyTested.has(part.juzNumber));
    if (!due.length && !tested) continue;
    students.push({ id:student.id, name:student.name, committeeName:student.committeeName, tested,
      juzNumbers:due.length ? due.map(part => part.juzNumber) : parts.map(part => part.juzNumber) });
  }
  const tested = students.filter(student => student.tested).length;
  return { expected:students.length, tested, percentage:students.length ? Math.round(tested/students.length*100) : null,
    studentsList:students.sort((a,b) => Number(a.tested)-Number(b.tested) || a.name.localeCompare(b.name,'ar')) };
}

export async function loadBranchPassingOverview(scope, { from, to, referenceConnection = scope }) {
  if (from > to) return { expected:0, tested:0, percentage:null, studentsList:[] };
  const [tasks] = await scope.query(`SELECT t.student_id AS studentId,s.name AS studentName,c.name AS committeeName,
    t.from_page AS startPage,t.from_surah AS startSurah,t.from_ayah AS startAyah,
    COALESCE(t.actual_to_page,t.to_page) AS endPage,COALESCE(t.actual_to_surah,t.to_surah) AS endSurah,
    COALESCE(t.actual_to_ayah,t.to_ayah) AS endAyah
    FROM student_quran_tasks t JOIN student_quran_plans p ON p.id=t.plan_id AND p.student_id=t.student_id
    JOIN students s ON s.id=t.student_id LEFT JOIN committees c ON c.id=s.committee_id
    WHERE t.task_type='memorization' AND t.teacher_completed=1 AND t.task_date<=?
      AND (t.evaluated_at IS NULL OR t.evaluated_at<DATE_ADD(?,INTERVAL 1 DAY))
      AND ${currentQuranPlanSql('p')} AND ${scope.student('t.student_id')}
      AND t.from_surah IS NOT NULL AND t.from_ayah IS NOT NULL AND t.to_surah IS NOT NULL AND t.to_ayah IS NOT NULL`, [to,to]);
  if (!tasks.length) return { expected:0, tested:0, percentage:null, studentsList:[] };
  const [attempts] = await scope.query(`SELECT e.student_id AS studentId,part.juz_number AS juzNumber,
    DATE_FORMAT(a.created_at,'%Y-%m-%d') AS date
    FROM student_passing_attempts a JOIN student_passing_parts part ON part.id=a.part_id
    JOIN student_passing_exams e ON e.id=part.exam_id
    WHERE e.exam_type='branch' AND a.created_at<DATE_ADD(?,INTERVAL 1 DAY) AND ${scope.student('e.student_id')}`, [to]);
  return branchPassingOverview(await readQuranRange(referenceConnection,1,604),tasks,attempts,{ from,to });
}
