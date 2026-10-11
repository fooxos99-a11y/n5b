import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePassingPolicy, effectivePassingPolicy, passingPolicyErrors, evaluatePassingPart, passingExamStatus } from '../shared/passing-policy.js';
import { buildPassingParts } from '../server/services/passing.js';
import { changeStudentPlanPause, parseStudentPlanPause, withStudentPlanPause, isStudentStudyHoliday, effectiveStudentPlanPaused } from '../shared/student-plan-pause.js';
import { studyDateSql, studyWeekSql, studentPlansRunningSql } from '../server/services/seasonalHolidays.js';
import { computeStudentsWeeklyGrades } from '../server/services/grading.js';
import { loadExpectedGrades } from '../server/services/expectedGrades.js';
import { normalizeGradingPolicy } from '../shared/grading-policy.js';
import { planScheduleDates } from '../server/services/planScheduleDates.js';

test('passing types have independent defaults, deductions and inherited per-juz overrides', () => {
  const policy = parsePassingPolicy();
  policy.branch.mistakeDeduction = 3;
  policy.hafiz.passScore = 90;
  policy.hafiz.juzOverrides[2] = { passScore: 80, hesitationDeduction: 2 };
  assert.equal(effectivePassingPolicy(policy, 'hafiz', 1).mistakeDeduction, 5);
  assert.equal(effectivePassingPolicy(policy, 'branch', 2).passScore, 85);
  assert.equal(effectivePassingPolicy(policy, 'hafiz', 1).passScore, 90);
  assert.equal(effectivePassingPolicy(policy, 'hafiz', 2).passScore, 80);
  assert.equal(effectivePassingPolicy(policy, 'hafiz', 2).hesitationDeduction, 2);
  assert.deepEqual(passingPolicyErrors(policy), {});
});
test('each part passes solely on combined deductions, including the exact grade boundary', () => {
  const policy = { ...effectivePassingPolicy(null, 'branch', 1), hesitationDeduction: 2 };
  assert.equal(evaluatePassingPart(policy, { mistakeCount: 3 }).passed, true);
  const boundary = evaluatePassingPart(policy, { mistakeCount: 2, warningCount: 3, hesitationCount: 1 });
  assert.equal(boundary.score, 85);
  assert.equal(boundary.passed, true);
  assert.deepEqual([boundary.mistakeCount, boundary.warningCount, boundary.hesitationCount], [2, 3, 1]);
  const result = evaluatePassingPart(policy, { mistakeCount: 2, warningCount: 4, hesitationCount: 1 });
  assert.equal(result.score, 84);
  assert.equal(result.passed, false);
  assert.deepEqual(result.reasons, ['الدرجة أقل من حد الاجتياز']);
  assert.equal(evaluatePassingPart(policy, { warningCount: 15 }).passed, true);
  assert.equal(evaluatePassingPart(policy, { mistakeCount: 1000 }).score, 0);
});
test('legacy count limits are removed from policies and cannot reject new attempts', () => {
  const legacy = parsePassingPolicy();
  for (const type of ['branch', 'hafiz']) {
    Object.assign(legacy[type], { maxMistakes: 0, maxWarnings: 0, maxHesitations: 0 });
    legacy[type].juzOverrides[2] = { maxMistakes: 0, maxWarnings: 0, maxHesitations: 0, warningDeduction: 0.5 };
    const result = evaluatePassingPart(legacy[type], { mistakeCount: 1, warningCount: 1, hesitationCount: 100 });
    assert.equal(result.passed, true);
    assert.equal(result.score, 94);
  }
  const clean = parsePassingPolicy(JSON.stringify(legacy));
  assert.doesNotMatch(JSON.stringify(clean), /maxMistakes|maxWarnings|maxHesitations/);
  assert.deepEqual(passingPolicyErrors(clean), {});
  assert.equal(effectivePassingPolicy(clean, 'hafiz', 2).warningDeduction, 0.5);
  assert.equal(effectivePassingPolicy(clean, 'branch', 2).mistakeDeduction, 5);
});
test('invalid, empty and impossible grade policies are rejected', () => {
  for (const [key, value] of [['maxScore', ''], ['maxScore', 0], ['passScore', 101], ['passScore', NaN], ['mistakeDeduction', -1], ['warningDeduction', '2'], ['hesitationDeduction', Infinity]]) {
    const policy = parsePassingPolicy(); policy.branch[key] = value;
    assert.ok(Object.keys(passingPolicyErrors(policy)).length);
  }
  const policy = parsePassingPolicy(); policy.branch.juzOverrides[31] = {};
  assert.ok(passingPolicyErrors(policy).branch);
  assert.ok(passingPolicyErrors(null).hafiz);
});
test('hafiz includes only fully covered juz and rejects gaps or partial memorization', () => {
  const ayahs = Array.from({ length: 8 }, (_, index) => ({ surah: 2, surahName: 'البقرة', ayah: index + 1, page: 2, juz: index < 4 ? 1 : 2 }));
  const ranges = [{ startSurah: 2, startAyah: 2, endSurah: 2, endAyah: 3 }, { startSurah: 2, startAyah: 5, endSurah: 2, endAyah: 5 }, { startSurah: 2, startAyah: 7, endSurah: 2, endAyah: 8 }];
  const result = buildPassingParts(ayahs, ranges, 'hafiz');
  assert.deepEqual(result, []);
  assert.deepEqual(buildPassingParts(ayahs, [{ startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 5 }], 'hafiz').map(part => part.juzNumber), [1]);
  assert.deepEqual(buildPassingParts(ayahs, [{ startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 2 }, { startSurah: 2, startAyah: 3, endSurah: 2, endAyah: 4 }], 'hafiz')[0].ranges.map(range => [range.startAyah, range.endAyah]), [[1, 4]]);
  assert.deepEqual(buildPassingParts(ayahs, [], 'hafiz'), []);
  assert.deepEqual(buildPassingParts(ayahs, ranges, 'branch', 1), []);
  assert.deepEqual(buildPassingParts(ayahs, [{ startSurah: 2, startAyah: 8, endSurah: 2, endAyah: 5 }], 'hafiz')[0].ranges.map(range => [range.startAyah, range.endAyah]), [[5, 8]]);
});

test('branch passing requires complete saved coverage and selects one eligible juz', () => {
  const ayahs = Array.from({ length: 8 }, (_, index) => ({ surah: 2, surahName: 'البقرة', ayah: index + 1, page: 2, juz: index < 4 ? 1 : 2 }));
  const ranges = [{ startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 3 }, { startSurah: 2, startAyah: 5, endSurah: 2, endAyah: 8 }];
  assert.deepEqual(buildPassingParts(ayahs, ranges, 'branch').map(part => part.juzNumber), [2]);
  assert.deepEqual(buildPassingParts(ayahs, ranges, 'branch', 1), []);
  assert.deepEqual(buildPassingParts(ayahs, ranges, 'branch', 2).map(part => part.juzNumber), [2]);
  assert.deepEqual(buildPassingParts(ayahs, [], 'branch', 2), []);
});
test('a good average cannot hide a failed or untested part', () => {
  const passed = { latestAttempt: { result: { passed: true, score: 100 } } };
  const failed = { latestAttempt: { result: { passed: false, score: 84 } } };
  assert.equal(passingExamStatus([passed, failed]), 'repeat');
  assert.equal(passingExamStatus([passed, {}]), 'in_progress');
  assert.equal(passingExamStatus([{}, {}]), 'pending');
  assert.equal(passingExamStatus([]), 'pending');
  assert.equal(passingExamStatus([passed, passed]), 'passed');
});
test('individual pauses affect one student, and global resume retains the individual pause', () => {
  const pause = changeStudentPlanPause(parseStudentPlanPause(), { paused: true, revision: 0, date: '2026-10-01' });
  const settings = { planPause: parseStudentPlanPause(), studentPlanPauses: { 3: pause } };
  const own = withStudentPlanPause(settings, 3), other = withStudentPlanPause(settings, 4);
  assert.equal(isStudentStudyHoliday('2026-10-02', own), true);
  assert.equal(isStudentStudyHoliday('2026-10-02', other), false);
  assert.equal(effectiveStudentPlanPaused(own), true);
  const global = { ...settings, planPause: pause };
  assert.equal(effectiveStudentPlanPaused(withStudentPlanPause(global, 4)), true);
  assert.equal(effectiveStudentPlanPaused(withStudentPlanPause({ ...global, planPause: parseStudentPlanPause() }, 3)), true);
  assert.match(studyDateSql('t.task_date', 't.student_id'), /individual_pause.student_id = t.student_id/);
  assert.match(studyWeekSql('w.week_start', 'w.student_id'), /DATE_ADD\(w.week_start, INTERVAL 6 DAY\)/);
  assert.match(studentPlansRunningSql('t.student_id'), /individual_pause.student_id = t.student_id/);
  assert.throws(() => studyDateSql('t.task_date', 's.id; DROP TABLE students'));
});
test('individual stopped days leave grades, denominators and schedules for the other student unchanged', async () => {
  const pause = { revision: 1, periods: [{ startDate: '2026-10-04', endDate: '2026-10-10' }] };
  const query = async (sql, params) => {
    if (sql.startsWith('SELECT state_json AS pause')) return [[{ pause: params?.[0] === 3 ? pause : parseStudentPlanPause() }]];
    if (sql.includes('FROM student_plan_pauses')) return [[{ studentId: 3, pause }]];
    if (sql.includes('AS pause')) return [[{ pause: parseStudentPlanPause() }]];
    if (sql.includes('FROM student_quran_plans')) return [[3, 4].map(studentId => ({ studentId, startDate: '2020-01-01', status: 'active' }))];
    if (sql.includes('FROM students')) return [[3, 4].map(id => ({ id, joined: '2020-01-01' }))];
    return [[]];
  };
  const connection = { query, student: () => '1=1' };
  const results = await computeStudentsWeeklyGrades(connection, { studentIds: [3, 4], weekStart: '2026-10-04', today: '2026-10-10' });
  assert.equal(results.get(3).weeklyProgram.max, 0);
  assert.ok(results.get(4).weeklyProgram.max > 0);
  const expected = await loadExpectedGrades(connection, { from: '2026-10-04', to: '2026-10-10', today: '2026-10-10', policy: normalizeGradingPolicy() });
  assert.equal(expected[0].programMax, 0); assert.ok(expected[1].programMax > 0);
  assert.deepEqual(await planScheduleDates(connection, '2026-10-04', '2026-10-10', [0,1,2,3,4,5,6], 'workDays', 3), []);
  assert.equal((await planScheduleDates(connection, '2026-10-04', '2026-10-10', [0,1,2,3,4,5,6], 'workDays', 4)).length, 7);
});
