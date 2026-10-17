import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveStaffPermissions, hasExtendedReciterPermissions } from '../shared/dashboard-permissions.js';
import { isReciterBaseApiRequest } from '../server/services/reciterAccess.js';

test('reciters start with calls only and acquire no teacher permissions implicitly', () => {
  assert.deepEqual(effectiveStaffPermissions('reciter'), ['calls']);
  assert.deepEqual(effectiveStaffPermissions('reciter', ['reports', 'reports', 'unknown']), ['calls', 'reports']);
  assert.equal(hasExtendedReciterPermissions(['calls']), false);
  assert.equal(hasExtendedReciterPermissions(['calls', 'reports']), true);
  assert.deepEqual(effectiveStaffPermissions('supervisor'), ['quranEvaluation', 'studentPlans', 'calls', 'reports']);
  assert.deepEqual(effectiveStaffPermissions('admin', ['quranEvaluation', 'calls']), ['calls']);
});

test('reciter account routes allow calls and own-session actions without legacy teacher exceptions', () => {
  for (const [method, path] of [['GET', '/api/calls'], ['GET', '/calls/events'], ['POST', '/calls/1/token'],
    ['POST', '/calls/1/close'], ['GET', '/dashboard-permissions/me'], ['GET', '/dashboard-bootstrap'],
    ['POST', '/auth/logout'], ['GET', '/account-deletion/me'], ['POST', '/account-deletion']]) {
    assert.equal(isReciterBaseApiRequest({ method, path }), true, `${method} ${path}`);
  }
  for (const path of ['/calls-unrelated', '/students', '/students/3', '/student-plans', '/reports/overview', '/settings',
    '/supervisors/7/quran-evaluation', '/offline-recitation/bootstrap', '/recitation-preferences', '/staff-attendance',
    '/notifications', '/rankings/students', '/dashboard-permissions/7', '/reciters']) {
    assert.equal(isReciterBaseApiRequest({ method: 'GET', path }), false, path);
    assert.equal(isReciterBaseApiRequest({ method: 'POST', path }), false, path);
  }
  assert.equal(isReciterBaseApiRequest({ method: 'PUT', path: '/dashboard-bootstrap' }), false);
});
