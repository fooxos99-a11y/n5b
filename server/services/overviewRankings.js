// Rankings of the statistics page: best students and circles by their grades, and each teacher's indicators.

const number = (value) => Number(value || 0);
const percentage = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar');
// Every recorded grade (weekly program, both sessions and narration day) is stored as a point with this key prefix.
const GRADE_POINTS = `t.dedupe_key LIKE 'grade:%'`;
const SIGNED_POINTS = `CASE WHEN t.transaction_type = 'deduction' THEN -t.points ELSE t.points END`;
const byPercentage = (a, b) => {
  if (a.percentage == null) return b.percentage == null ? byName(a, b) : 1;
  if (b.percentage == null) return -1;
  return b.percentage - a.percentage || byName(a, b);
};
const orderByPercentage = rows => rows.sort(byPercentage);

function complexRankings(complexRows, circles, graded) {
  return complexRows.map(complex => {
    const members = circles.filter(circle => String(circle.complexId) === String(complex.id));
    const studentsCount = members.reduce((sum, row) => sum + row.studentsCount, 0);
    const grade = members.reduce((sum, row) => sum + row.grade, 0);
    const max = members.reduce((sum, row) => sum + number(row.max), 0);
    return { id: number(complex.id), name: complex.name, committeesCount: members.length, studentsCount, grade,
      ...(graded ? { max, percentage: max > 0 ? percentage(grade, max) : null }
        : { average: studentsCount ? Math.round(grade / studentsCount * 10) / 10 : 0 }) };
  }).sort((a, b) => graded ? byPercentage(a, b) : b.average - a.average || byName(a, b));
}

/**
 * @param reportDb scoped report connection (createOverviewReportScope)
 * @param {{ from: string, to: string, attendanceDates: string[], attendanceWeekDays: number[] }} period
 */
export async function buildOverviewRankings(reportDb, { from, to, attendanceDates = [], grades = null }) {
  const [studentRows] = await reportDb.query(
    `SELECT s.id, s.name, c.id AS committeeId, c.name AS committeeName, cx.id AS complexId, cx.name AS complexName,
       COALESCE(SUM(${SIGNED_POINTS}), 0) AS grade
     FROM students s
     LEFT JOIN committees c ON c.id = s.committee_id
     LEFT JOIN complexes cx ON cx.id = c.complex_id
     LEFT JOIN student_point_transactions t ON t.student_id = s.id AND ${GRADE_POINTS} AND t.transaction_date BETWEEN ? AND ?
     WHERE ${reportDb.student('s.id')}
     GROUP BY s.id, s.name, c.id, c.name, cx.id, cx.name`,
    [from, to],
  );
  const bestStudents = studentRows
    .map(row => ({ ...row, id: number(row.id), committeeName: row.committeeName || '', grade: number(row.grade) }))
    .sort((a, b) => b.grade - a.grade || byName(a, b));

  const [committeeRows] = await reportDb.query(
    `SELECT c.id, c.name, cx.id AS complexId, cx.name AS complexName,
       COUNT(DISTINCT s.id) AS studentsCount, COALESCE(SUM(${SIGNED_POINTS}), 0) AS grade
     FROM committees c
     LEFT JOIN complexes cx ON cx.id = c.complex_id
     LEFT JOIN students s ON s.committee_id = c.id
     LEFT JOIN student_point_transactions t
       ON t.student_id = s.id AND ${GRADE_POINTS} AND t.transaction_date BETWEEN ? AND ?
     WHERE ${reportDb.committee('c.id')}
     GROUP BY c.id, c.name, cx.id, cx.name`,
    [from, to],
  );
  // Circles are compared by the average grade of their students, so a large circle is not favoured.
  const bestCommittees = committeeRows
    .map((row) => {
      const studentsCount = number(row.studentsCount);
      const grade = number(row.grade);
      return { id: number(row.id), name: row.name, complexId: row.complexId, complexName: row.complexName,
        studentsCount, grade, average: studentsCount ? Math.round((grade / studentsCount) * 10) / 10 : 0 };
    })
    .sort((a, b) => b.average - a.average || byName(a, b));
  const [complexRows] = reportDb.complex
    ? await reportDb.query(`SELECT cx.id, cx.name FROM complexes cx WHERE ${reportDb.complex('cx.id')}`)
    : [[]];

  const [teacherRows] = await reportDb.query(
    `SELECT sp.id, sp.name, DATE_FORMAT(sp.created_at, '%Y-%m-%d') AS joined,
       GROUP_CONCAT(DISTINCT c.id) AS committeeIds, GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR '، ') AS committees
     FROM supervisors sp
     LEFT JOIN supervisor_committees sc ON sc.supervisor_id = sp.id
     LEFT JOIN committees c ON c.id = sc.committee_id
     WHERE sp.role = 'supervisor' AND sp.is_active = 1 AND ${reportDb.staff('sp.id')}
     GROUP BY sp.id, sp.name, sp.created_at`,
  );
  const dayPlaceholders = attendanceDates.map(() => '?').join(', ');
  const [attendanceRows] = attendanceDates.length
    ? await reportDb.query(
      `SELECT ar.supervisor_id AS teacherId,
         COALESCE(SUM(ar.status IN ('present', 'late', 'excused')), 0) AS attended,
         COALESCE(SUM(ar.status = 'late'), 0) AS late,
         COALESCE(SUM(ar.status = 'absent'), 0) AS absent
       FROM supervisor_attendance_records ar
       WHERE ar.record_date BETWEEN ? AND ? AND ${reportDb.staff('ar.supervisor_id')}
         AND ar.record_date IN (${dayPlaceholders})
       GROUP BY ar.supervisor_id`,
      [from, to, ...attendanceDates],
    )
    : [[]];
  // A teacher's achievement is the weekly program result of the students in the teacher's circles.
  const [achievementRows] = await reportDb.query(
    `SELECT sc.supervisor_id AS teacherId, COALESCE(SUM(g.grade), 0) AS grade, COALESCE(SUM(g.max_grade), 0) AS max
     FROM supervisor_committees sc
     JOIN students s ON s.committee_id = sc.committee_id
     JOIN student_daily_grades g ON g.student_id = s.id AND g.grade_date BETWEEN ? AND ?
     WHERE ${reportDb.staff('sc.supervisor_id')}
     GROUP BY sc.supervisor_id`,
    [from, to],
  );
  const attendanceById = new Map(attendanceRows.map((row) => [String(row.teacherId), row]));
  const achievementById = new Map(achievementRows.map((row) => [String(row.teacherId), row]));
  const expectedDays = attendanceDates.length;
  const teachers = teacherRows
    .map((row) => {
      const attendance = attendanceById.get(String(row.id)) || {};
      let achievement = achievementById.get(String(row.id)) || {};
      if (grades) {
        const ids = new Set(String(row.committeeIds || '').split(','));
        achievement = (grades.weeklyProgram?.committees || []).filter(item => ids.has(String(item.id)))
          .reduce((sum, item) => ({ grade: sum.grade + item.grade, max: sum.max + item.max }), { grade: 0, max: 0 });
      }
      const teacherExpectedDays = row.joined ? attendanceDates.filter(date => date >= row.joined).length : expectedDays;
      return {
        id: number(row.id),
        name: row.name,
        committees: row.committees || '',
        attendance: {
          attended: number(attendance.attended),
          late: number(attendance.late),
          absent: number(attendance.absent),
          expected: teacherExpectedDays,
          percentage: percentage(number(attendance.attended), teacherExpectedDays),
        },
        achievement: {
          grade: number(achievement.grade),
          max: number(achievement.max),
          percentage: percentage(number(achievement.grade), number(achievement.max)),
        },
      };
    })
    .sort((a, b) => b.achievement.percentage - a.achievement.percentage || byName(a, b));

  if (grades) {
    const totals = new Map(bestStudents.map(row => [String(row.id), { ...row, grade: 0, max: 0 }]));
    const circleIdsByName = new Map();
    for (const circle of committeeRows) circleIdsByName.set(circle.name, circleIdsByName.has(circle.name) ? null : number(circle.id));
    for (const component of ['weeklyProgram', 'weeklySession', 'trackSession']) {
      for (const row of grades[component]?.studentsList || []) {
        const result = totals.get(String(row.id)) || { id: row.id, name: row.name, committeeName: row.committeeName, grade: 0, max: 0 };
        result.committeeId = row.committeeId ?? result.committeeId ?? circleIdsByName.get(row.committeeName);
        result.grade += number(row.grade);
        result.max += number(row.max);
        totals.set(String(row.id), result);
      }
    }
    const ranked = [...totals.values()].map(row => ({ ...row, percentage: row.max > 0 ? percentage(row.grade, row.max) : null }));
    const totalsByCircle = new Map();
    for (const student of ranked) {
      const key = String(student.committeeId);
      const total = totalsByCircle.get(key) || { studentsCount: 0, grade: 0, max: 0 };
      total.studentsCount += 1;
      total.grade += student.grade;
      total.max += student.max;
      totalsByCircle.set(key, total);
    }
    const circleResults = committeeRows.map(row => {
      const { studentsCount, grade, max } = totalsByCircle.get(String(row.id)) || { studentsCount: 0, grade: 0, max: 0 };
      return { id: number(row.id), name: row.name, complexId: row.complexId, complexName: row.complexName,
        studentsCount, grade, max, percentage: max > 0 ? percentage(grade, max) : null };
    });
    const narrationGrades = new Map((grades.narration?.studentsList || []).map(row => [String(row.id), number(row.grade)]));
    // Narration contributes to student totals; circles keep their expected-grade comparison.
    const studentResults = ranked.map(row => ({ ...row, grade: row.grade + (narrationGrades.get(String(row.id)) || 0) }))
      .sort((a, b) => b.grade - a.grade || byName(a, b));
    return { bestStudents: studentResults, bestCommittees: orderByPercentage(circleResults), bestComplexes: complexRankings(complexRows, circleResults, true), teachers };
  }
  return { bestStudents, bestCommittees, bestComplexes: complexRankings(complexRows, bestCommittees, false), teachers };
}
