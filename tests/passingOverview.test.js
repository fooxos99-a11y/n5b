import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPassingOverview, loadPassingOverview } from '../server/services/passingOverview.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

const dates = { from: '2026-10-01', to: '2026-10-22' };
const students = [1, 2, 3].map(id => ({ id, name: `طالب ${id}`, committeeName: 'الفجر' }));
const eligible = new Map(students.map(student => [String(student.id), [{ juzNumber: 1 }, { juzNumber: 2 }]]));
const attempt = (id, studentId, juzNumber, score, type = 'branch', date = dates.to) =>
  ({ id, studentId, juzNumber, type, date, result: { score, maxScore: 100, passed: score >= 85 }, policy: {} });

test('latest attempt per part, equal student weights, zero scores and independent passing types', () => {
  const report = buildPassingOverview(students, eligible, [attempt(1, 1, 1, 20), attempt(2, 1, 1, 90),
    attempt(3, 1, 2, 70), attempt(4, 2, 1, 90), attempt(5, 1, 1, 40, 'hafiz')], dates);
  assert.equal(report.branchPassing.percentage, 85);
  assert.equal(report.branchPassing.expected, 3);
  assert.equal(report.branchPassing.tested, 2);
  assert.equal(report.branchPassing.testedParts, 3);
  assert.equal(report.branchPassing.passedParts, 2);
  assert.equal(report.branchPassing.studentsList.find(row => row.id === 1).percentage, 80);
  assert.equal(report.branchPassing.studentsList.find(row => row.id === 3).percentage, null);
  assert.equal(report.hafizPassing.percentage, 40);
  assert.equal(buildPassingOverview(students, eligible, [attempt(8, 1, 1, 0)], dates).branchPassing.percentage, 0);
});

test('period boundaries and authorized students exclude previous, future and other accounts', () => {
  const report = buildPassingOverview(students, eligible, [attempt(1, 1, 1, 10, 'branch', '2026-09-30'),
    attempt(2, 1, 1, 20, 'branch', '2026-10-23'), attempt(3, 99, 1, 100),
    attempt(4, 2, 1, 75, 'branch', dates.from)], dates);
  assert.equal(report.branchPassing.percentage, 75);
  assert.equal(report.branchPassing.tested, 1);
  assert.equal(report.hafizPassing.percentage, null);
  assert.equal(buildPassingOverview([], new Map(), [], dates).branchPassing.percentage, null);
});

test('passing scope batches both prior sources and approved history across plans with range expansion', async () => {
  const calls = [];
  const ayahs = [{ page: 1, surah: 1, ayah: 1, juz: 1 }, { page: 1, surah: 1, ayah: 2, juz: 1 }];
  const ranges = [{ studentId: 1, startPage: 1, startSurah: 1, startAyah: 1, endPage: 1, endSurah: 1, endAyah: 2, traversal: 1 }];
  const connection = { query: async (sql, values) => { calls.push({ sql, values }); return [sql.includes('LEFT JOIN committees') ? students : sql.includes('UNION ALL') ? ranges : [attempt(1, 1, 1, 90)]]; } };
  const scope = createOverviewReportScope(connection, { auth: { role: 'supervisor', id: 7 }, committeeId: 3, complexId: 2 });
  let expanded = 0;
  const report = await loadPassingOverview(scope, { ...dates, referenceConnection: { query: async () => [ayahs] },
    expand: async range => { expanded++; return [range]; } });
  assert.equal(calls.length, 3, 'Queries are batched rather than issued once per student');
  assert.equal(expanded, 1);
  assert.match(calls[1].sql, /student_quran_prior_memorization/);
  assert.match(calls[1].sql, /student_quran_plan_prior_memorization/);
  assert.match(calls[1].sql, /teacher_completed=1/);
  assert.doesNotMatch(calls[1].sql, /MAX\(current_plan.id\)/);
  assert.ok(calls.every(call => [7, 3, 2].every(value => call.values.includes(value))));
  assert.equal(calls[2].values[0], dates.from); assert.equal(calls[2].values[1], dates.to);
  assert.equal(report.branchPassing.percentage, 90);
  assert.equal(report.hafizPassing.percentage, null);
});
