import { buildPassingParts } from './passingEligibility.js';
import { readQuranRange } from './quranReferenceCache.js';
import { buildPassingReport, averagePassingPercentages } from '../../shared/passing-report.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

export function buildPassingOverview(students, eligible, attempts, { from, to }) {
  const grouped = new Map();
  for (const attempt of attempts) {
    if (attempt.date < from || attempt.date > to || !['branch', 'hafiz'].includes(attempt.type)) continue;
    const key = `${attempt.type}:${attempt.studentId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ id: attempt.id, type: attempt.type, parts: [{ juzNumber: Number(attempt.juzNumber),
      attempts: [{ id: Number(attempt.id), result: parse(attempt.result), policy: parse(attempt.policy) }] }] });
  }
  return Object.fromEntries(['branch', 'hafiz'].map(type => {
    const studentsList = students.flatMap(student => {
      const parts = eligible.get(String(student.id)) || [];
      const report = buildPassingReport(grouped.get(`${type}:${student.id}`) || [], parts);
      if (!parts.length && !report.summary.attemptCount) return [];
      return [{ ...student, ...report.summary, tested: report.summary.percentage !== null,
        eligibleParts: parts.length, juzNumbers: parts.map(part => part.juzNumber) }];
    }).sort((a, b) => (a.percentage ?? Infinity) - (b.percentage ?? Infinity) || a.name.localeCompare(b.name, 'ar'));
    return [`${type === 'branch' ? 'branch' : 'hafiz'}Passing`, {
      metric: 'result_average', expected: studentsList.length, tested: studentsList.filter(student => student.tested).length,
      percentage: averagePassingPercentages(studentsList.map(student => student.percentage)),
      testedParts: studentsList.reduce((sum, student) => sum + student.testedParts, 0),
      passedParts: studentsList.reduce((sum, student) => sum + student.passedParts, 0), studentsList,
    }];
  }));
}

export async function loadPassingOverview(scope, { from, to, referenceConnection = scope, expand = async range => [range] }) {
  if (from > to) return buildPassingOverview([], new Map(), [], { from, to });
  const [students] = await scope.query(`SELECT s.id,s.name,c.name AS committeeName FROM students s
    LEFT JOIN committees c ON c.id=s.committee_id WHERE ${scope.student('s.id')}`);
  if (!students.length) return buildPassingOverview([], new Map(), [], { from, to });
  // The same approved memorization and both prior-memorization sources used by passing eligibility,
  // loaded in batches across the authorized scope instead of querying once per student.
  const [ranges] = await scope.query(`SELECT student_id AS studentId,start_page AS startPage,start_surah AS startSurah,
    start_ayah AS startAyah,end_page AS endPage,end_surah AS endSurah,end_ayah AS endAyah,0 AS traversal
    FROM student_quran_prior_memorization WHERE ${scope.student('student_id')}
    UNION ALL SELECT student_id,start_page,start_surah,start_ayah,end_page,end_surah,end_ayah,0
    FROM student_quran_plan_prior_memorization WHERE ${scope.student('student_id')}
    UNION ALL SELECT student_id,from_page,from_surah,from_ayah,COALESCE(actual_to_page,to_page),
    COALESCE(actual_to_surah,to_surah),COALESCE(actual_to_ayah,to_ayah),1
    FROM student_quran_tasks WHERE task_type='memorization' AND teacher_completed=1 AND task_date<=?
      AND (evaluated_at IS NULL OR evaluated_at<DATE_ADD(?,INTERVAL 1 DAY)) AND ${scope.student('student_id')}
      AND from_surah IS NOT NULL AND from_ayah IS NOT NULL AND to_surah IS NOT NULL AND to_ayah IS NOT NULL`, [to, to]);
  const ayahs = await readQuranRange(referenceConnection, 1, 604);
  const byStudent = new Map();
  for (const range of ranges) {
    const key = String(range.studentId);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent.get(key).push(...(Number(range.traversal) ? await expand(range) : [range]));
  }
  const eligible = new Map([...byStudent].map(([id, rows]) => [id, buildPassingParts(ayahs, rows, 'hafiz')]));
  const [attempts] = await scope.query(`SELECT a.id,e.student_id AS studentId,e.exam_type AS type,part.juz_number AS juzNumber,
    a.result_json AS result,a.policy_json AS policy,DATE_FORMAT(a.created_at,'%Y-%m-%d') AS date
    FROM student_passing_attempts a JOIN student_passing_parts part ON part.id=a.part_id
    JOIN student_passing_exams e ON e.id=part.exam_id WHERE a.created_at>=? AND a.created_at<DATE_ADD(?,INTERVAL 1 DAY)
      AND ${scope.student('e.student_id')}`, [from, to]);
  return buildPassingOverview(students, eligible, attempts, { from, to });
}
