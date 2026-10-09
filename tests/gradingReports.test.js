import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGradingOverview, buildGradingSessionReport } from '../server/services/gradingReports.js';

test('session report aggregates the weeks touching the period and scopes teachers', async () => {
  let captured;
  const connection = { query: async (sql, params) => {
    if (sql.startsWith('SELECT student_id AS studentId, state_json AS pause')) return [[]];
    if (sql.includes('FROM student_day_compensations') || sql.includes('SELECT student_id AS studentId, detail_json AS detail')) return [[]];
    if (sql.startsWith('SELECT setting_value')) return [[]];
    if (sql.includes('FROM grading_week_policies')) return [[]];
    if (sql.includes('AS joined')) return [[{ id: 3, name: 'خالد', committeeName: 'الحلقة', joined: '2026-01-01' }, { id: 4, name: 'سعيد', committeeName: 'الحلقة', joined: '2026-01-01' }]];
    captured = { sql, params };
    return [[{ id: 3, name: 'خالد', committeeName: 'الحلقة', recordedWeeks: 2, attended: 1, absent: 1, grade: 25, max: 60 }]];
  } };
  const report = await buildGradingSessionReport(connection, { component: 'track', from: '2026-09-22', to: '2026-09-30', auth: { role: 'supervisor', id: 7 } });
  assert.deepEqual(captured.params.slice(0, 3), ['track', '2026-09-20', '2026-09-30']);
  assert.equal(captured.params.at(-1), 7);
  assert.match(captured.sql, /LEFT JOIN student_weekly_components w/);
  assert.deepEqual(report.rows[0], { id: 3, name: 'خالد', committeeName: 'الحلقة', recordedWeeks: 2, segments: { tested: 0, total: 0, mistakes: 0, warnings: 0, hesitations: 0, grade: 0, max: 0, compensated: 0 }, attended: 1, absent: 1, late: 0, excused: 0, grade: 25, max: 60, percentage: 41.7 });
  assert.deepEqual(report.rows[1], { id: 4, name: 'سعيد', committeeName: 'الحلقة', recordedWeeks: 0, segments: { tested: 0, total: 0, mistakes: 0, warnings: 0, hesitations: 0, grade: 0, max: 0, compensated: 0 }, attended: 0, absent: 0, late: 0, excused: 0, grade: 0, max: 60, percentage: 0 });
  await assert.rejects(buildGradingSessionReport(connection, { component: 'daily', from: '2026-09-22', to: '2026-09-30' }), /نوع الجلسة/);
  await assert.rejects(buildGradingSessionReport(connection, { component: 'weekly', from: '2026-09-30', to: '2026-09-22' }), /الفترة/);
});

test('statistics sum the weekly program, both sessions and narration', async () => {
  const answers = [
    [[{ grade: 45, max: 60, students: 3 }]],
    [[{ component: 'weekly', recorded: 1, attended: 1, absent: 0, grade: 20, max: 20 }]],
    [[{ grade: 12, students: 2 }]],
    [[{ faces: 10 }]],
    [[{ value: JSON.stringify({ statistics: { repetitionsPerFace: 40 } }) }]],
    [[
      { id: 1, name: 'أحمد', committeeId: 1, committeeName: 'الفجر', grade: 25, max: 30 },
      { id: 2, name: 'بدر', committeeId: 2, committeeName: 'العصر', grade: 20, max: 30 },
    ]],
    [[
      { component: 'weekly', id: 1, name: 'أحمد', committeeId: 1, committeeName: 'الفجر', attended: 1, absent: 0, grade: 20, max: 20 },
      { component: 'track', id: 2, name: 'بدر', committeeId: 2, committeeName: 'العصر', attended: 0, absent: 1, grade: 0, max: 30 },
    ]],
    [[{ studentId: 2, detail: JSON.stringify({ segments: [
      { recorded: true, mistakes: 2, warnings: 1, grade: 9, max: 10 },
      { recorded: false, mistakes: 0, warnings: 0, grade: 0, max: 10 },
    ] }) }]],
    [[{ studentId: 1, days: 3, faces: 6, hizbs: 2 }]],
    [[{ id: 1, name: 'أحمد', committeeName: 'الفجر', grade: 8, times: 2 }]],
    [[
      { id: 1, name: 'أحمد', committeeId: 1, committeeName: 'الفجر', joined: '2026-01-01' },
      { id: 2, name: 'بدر', committeeId: 2, committeeName: 'العصر', joined: '2026-01-01' },
    ]],
    [[]],
  ];
  const reportDb = { student: () => '1=1', query: async sql => sql.includes('AS holidays') || sql.includes('AS pause') || sql.includes('FROM student_day_compensations') ? [[]] : answers.shift() };
  const grades = await buildGradingOverview(reportDb, { from: '2026-09-20', to: '2026-09-26', quranFaces: { memorization: 2, review: 5, link: 3 } });
  // Each recited memorization face counts once plus its 40 repetitions: 2 × 41.
  const { readingByStudent: _reading, ...facesRead } = grades.facesRead;
  assert.deepEqual(facesRead, { memorization: 82, link: 3, review: 5, reading: 10, total: 100, repetitionsPerFace: 40 });
  const { committees, studentsList, ...program } = grades.weeklyProgram;
  assert.deepEqual(program, { grade: 45, max: 54, percentage: 83.3, students: 3 });
  // Circles and students are sorted by their result for the reports details.
  assert.deepEqual(committees.map((row) => [row.name, row.percentage]), [['الفجر', 92.6], ['العصر', 74.1]]);
  assert.deepEqual(studentsList.map((row) => row.name), ['أحمد', 'بدر']);
  const { committees: weeklyCommittees, studentsList: weeklyStudents, ...weekly } = grades.weeklySession;
  assert.deepEqual(weekly, { recorded: 1, attended: 1, absent: 0, late: 0, excused: 0, expectedAttendance: 2, grade: 20, max: 40, percentage: 50 });
  assert.deepEqual(weeklyCommittees, [{ id: 1, name: 'الفجر', grade: 20, max: 20, percentage: 100 }, { id: 2, name: 'العصر', grade: 0, max: 20, percentage: 0 }]);
  assert.deepEqual(weeklyStudents[0], { id: 1, name: 'أحمد', committeeName: 'الفجر', attendanceDays: 5, expectedWeeks: 1, attended: 1, absent: 0, late: 0, excused: 0, grade: 20, max: 20, percentage: 100 });
  assert.equal(weeklyStudents[1].expectedWeeks, 1);
  assert.equal(grades.trackSession.percentage, 0);
  assert.deepEqual(grades.trackSession.studentsList.map((row) => [row.name, row.absent]), [['أحمد', 0], ['بدر', 1]]);
  // Only recited segments count as tested; their mistakes and warnings add up per student and overall.
  assert.deepEqual(grades.trackSession.segments, { tested: 1, total: 2, mistakes: 2, warnings: 1, hesitations: 0, grade: 9, max: 10, compensated: 0 });
  assert.deepEqual(grades.trackSession.studentsList[1].segments, grades.trackSession.segments);
  assert.deepEqual(grades.facesRead.readingByStudent, { 1: 6 });
  // 2026-09-20 (Sunday) to 2026-09-26 (Saturday): every day is a reading day by default.
  assert.deepEqual(grades.reading, { expectedDays: 7, expectedByStudent: { '1': 7, '2': 7 }, days: 3, hizbs: 2, byStudent: { 1: { days: 3, faces: 6, hizbs: 2 } } });
  assert.deepEqual(grades.narration.studentsList, [{ id: 1, name: 'أحمد', committeeName: 'الفجر', grade: 8, times: 2 }]);
  assert.deepEqual({ grade: grades.narration.grade, students: grades.narration.students }, { grade: 12, students: 2 });
});
