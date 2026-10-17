import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveStaffPermissions } from '../shared/dashboard-permissions.js';
import { isTeacherApiRequest } from '../server/services/teacherAccess.js';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

test('teachers have immutable reports-only access regardless of stored grants', () => {
  assert.deepEqual(effectiveStaffPermissions('teacher'), ['reports']);
  assert.deepEqual(effectiveStaffPermissions('teacher', ['settings', 'students', 'calls', 'teachers']), ['reports']);
});

test('teachers only read scoped statistics and can log out', () => {
  for (const path of ['/api/reports/overview', '/reports/overview/export', '/reports/committees', '/reports/grading-sessions', '/dashboard-bootstrap', '/dashboard-permissions/me']) {
    assert.equal(isTeacherApiRequest({ method: 'GET', path }), true, path);
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal(isTeacherApiRequest({ method, path }), false, `${method} ${path}`);
  }
  assert.equal(isTeacherApiRequest({ method: 'POST', path: '/api/auth/logout' }), true);
  for (const path of ['/students', '/teachers', '/reciters', '/calls', '/supervisors/1/quran-evaluation', '/reports/archives', '/reports/students', '/reports/teacher-points', '/settings', '/notifications', '/reports/overview/unrelated']) {
    assert.equal(isTeacherApiRequest({ method: 'GET', path }), false, path);
  }
});

test('teacher report scopes bind their identity and intersect requested circle filters', async () => {
  const queries = [];
  const scope = createOverviewReportScope({ query: async (sql, params) => { queries.push({ sql, params }); return [[]]; } }, { auth: { role: 'teacher', id: 17 }, committeeId: 3 });
  await scope.query(`SELECT s.id FROM students s WHERE ${scope.student('s.id')}`);
  assert.match(queries[0].sql, /supervisor_committees/);
  assert.deepEqual(queries[0].params, [17, 3]);
  assert.throws(() => createOverviewReportScope({}, { auth: { role: 'teacher', id: 0 } }), /غير صالح/);
});
